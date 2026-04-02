"""
Fraud prediction scoring job.

Reads every order from shop.db, builds the 32-feature payload required
by the XGBoost model (via modeling.py), and upserts fraud predictions
into order_predictions. Falls back to simple heuristics if the .sav
model file is not found.

Output (parsed by the Node API route):
  {"scored": <int>, "timestamp": "<ISO 8601>"}
"""

import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone

# Allow importing modeling.py from the project root
PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, PROJECT_ROOT)

DB_PATH = os.path.join(PROJECT_ROOT, "shop.db")


def sigmoid(x: float) -> float:
    """Squash a raw score into (0, 1)."""
    return 1.0 / (1.0 + math.exp(-x))


def score_order_heuristic(row: dict) -> float:
    """Return a fraud probability in [0, 1] for one order (fallback heuristic)."""
    raw = 0.0

    if row["order_total"] > 500:
        raw += 1.2
    elif row["order_total"] > 200:
        raw += 0.6

    if row["ip_country"] != "US":
        raw += 1.5

    if row["payment_method"] == "crypto":
        raw += 0.8
    elif row["payment_method"] == "bank":
        raw += 0.3

    if row["promo_used"]:
        raw += 0.4

    if row["device_type"] == "mobile":
        raw += 0.3

    risk_score = row.get("risk_score") or 0
    if risk_score > 70:
        raw += 1.5
    elif risk_score > 40:
        raw += 0.7

    return round(sigmoid(raw - 1.5), 4)


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(json.dumps({"error": f"Database not found: {DB_PATH}"}))
        sys.exit(1)

    # Try to import modeling.py and load the model
    use_model = False
    try:
        from modeling import predict_transaction, load_model
        load_model()  # will raise FileNotFoundError if .sav missing
        use_model = True
        print(json.dumps({"info": "Using XGBoost model via modeling.py"}), file=sys.stderr)
    except (ImportError, FileNotFoundError) as e:
        print(json.dumps({"info": f"Model not available, using heuristic fallback: {e}"}), file=sys.stderr)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Drop old table schema if it has the legacy columns
    cur.execute("PRAGMA table_info(order_predictions)")
    columns = [col[1] for col in cur.fetchall()]
    if "late_delivery_probability" in columns:
        cur.execute("DROP TABLE order_predictions")

    # Ensure the predictions table exists
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS order_predictions (
            prediction_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id             INTEGER NOT NULL UNIQUE,
            fraud_probability    REAL    NOT NULL,
            predicted_fraud      INTEGER NOT NULL DEFAULT 0,
            prediction_timestamp TEXT    NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
        """
    )

    # Full query joining orders, customers, shipments, and order_items
    orders = cur.execute(
        """
        SELECT
            o.order_id,
            o.billing_zip,
            o.shipping_zip,
            o.shipping_state,
            o.payment_method,
            o.device_type,
            o.ip_country,
            o.promo_used,
            o.order_subtotal,
            o.shipping_fee,
            o.tax_amount,
            o.order_total,
            o.risk_score,
            o.order_datetime,
            c.gender,
            c.city,
            c.state              AS customer_state,
            c.customer_segment,
            c.loyalty_tier,
            c.is_active          AS customer_is_active,
            c.birthdate,
            s.carrier,
            s.shipping_method,
            s.distance_band,
            s.promised_days,
            s.actual_days,
            s.late_delivery,
            COALESCE(oi.total_units, 0)        AS total_units,
            COALESCE(oi.line_items, 0)         AS line_items,
            COALESCE(oi.distinct_products, 0)  AS distinct_products,
            COALESCE(oi.avg_unit_price, 0.0)   AS avg_unit_price,
            COALESCE(oi.line_total_sum, 0.0)   AS line_total_sum
        FROM orders o
        JOIN customers c ON c.customer_id = o.customer_id
        LEFT JOIN shipments s ON s.order_id = o.order_id
        LEFT JOIN (
            SELECT
                order_id,
                SUM(quantity)              AS total_units,
                COUNT(*)                   AS line_items,
                COUNT(DISTINCT product_id) AS distinct_products,
                AVG(unit_price)            AS avg_unit_price,
                SUM(line_total)            AS line_total_sum
            FROM order_items
            GROUP BY order_id
        ) oi ON oi.order_id = o.order_id
        """
    ).fetchall()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    scored = 0
    errors = 0

    for order in orders:
        row = dict(order)

        if use_model:
            try:
                # Compute derived features
                # customer_age: years from birthdate to order date
                from datetime import date
                if row["birthdate"]:
                    birth = datetime.strptime(row["birthdate"], "%Y-%m-%d").date()
                    order_date = datetime.strptime(row["order_datetime"][:10], "%Y-%m-%d").date()
                    age = (order_date - birth).days // 365
                else:
                    age = 30  # default

                order_dt = datetime.strptime(row["order_datetime"], "%Y-%m-%d %H:%M:%S")
                order_hour = order_dt.hour
                order_dayofweek = order_dt.weekday()

                # Build the 32-feature payload
                payload = {
                    "billing_zip":       row["billing_zip"] or "",
                    "shipping_zip":      row["shipping_zip"] or "",
                    "shipping_state":    row["shipping_state"] or "",
                    "payment_method":    row["payment_method"] or "card",
                    "device_type":       row["device_type"] or "desktop",
                    "ip_country":        row["ip_country"] or "US",
                    "promo_used":        row["promo_used"] or 0,
                    "order_subtotal":    row["order_subtotal"] or 0.0,
                    "shipping_fee":      row["shipping_fee"] or 0.0,
                    "tax_amount":        row["tax_amount"] or 0.0,
                    "order_total":       row["order_total"] or 0.0,
                    "risk_score":        row["risk_score"] or 0.0,
                    "gender":            row["gender"] or "Unknown",
                    "city":              row["city"] or "",
                    "customer_state":    row["customer_state"] or "",
                    "customer_segment":  row["customer_segment"] or "standard",
                    "loyalty_tier":      row["loyalty_tier"] or "none",
                    "customer_is_active": row["customer_is_active"] if row["customer_is_active"] is not None else 1,
                    "carrier":           row["carrier"] or "USPS",
                    "shipping_method":   row["shipping_method"] or "standard",
                    "distance_band":     row["distance_band"] or "regional",
                    "promised_days":     row["promised_days"] if row["promised_days"] is not None else 5,
                    "actual_days":       row["actual_days"] if row["actual_days"] is not None else 5,
                    "late_delivery":     row["late_delivery"] if row["late_delivery"] is not None else 0,
                    "total_units":       row["total_units"],
                    "line_items":        row["line_items"],
                    "distinct_products": row["distinct_products"],
                    "avg_unit_price":    row["avg_unit_price"],
                    "line_total_sum":    row["line_total_sum"],
                    "customer_age":      age,
                    "order_hour":        order_hour,
                    "order_dayofweek":   order_dayofweek,
                }

                result = predict_transaction(payload)
                prob = result["fraud_probability"]
                predicted_fraud = result["is_fraud"]
            except Exception as e:
                # If model scoring fails for a row, fall back to heuristic
                errors += 1
                if errors <= 3:
                    print(json.dumps({"warning": f"Model error on order {row['order_id']}: {e}"}), file=sys.stderr)
                prob = score_order_heuristic(row)
                predicted_fraud = 1 if prob >= 0.5 else 0
        else:
            prob = score_order_heuristic(row)
            predicted_fraud = 1 if prob >= 0.5 else 0

        cur.execute(
            """
            INSERT INTO order_predictions
                (order_id, fraud_probability, predicted_fraud,
                 prediction_timestamp)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET
                fraud_probability    = excluded.fraud_probability,
                predicted_fraud      = excluded.predicted_fraud,
                prediction_timestamp = excluded.prediction_timestamp
            """,
            (row["order_id"], prob, predicted_fraud, now),
        )
        scored += 1

    conn.commit()
    conn.close()

    output = {"scored": scored, "timestamp": now}
    if errors:
        output["model_errors"] = errors
    print(json.dumps(output))


if __name__ == "__main__":
    main()
