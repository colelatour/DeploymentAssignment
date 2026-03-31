"""
Late-delivery prediction scoring job.

Reads every order from shop.db, computes a late_delivery_probability using
simple feature heuristics, and upserts the result into order_predictions.

Output (parsed by the Node API route):
  {"scored": <int>, "timestamp": "<ISO 8601>"}
"""

import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "shop.db")


def sigmoid(x: float) -> float:
    """Squash a raw score into (0, 1)."""
    return 1.0 / (1.0 + math.exp(-x))


def score_order(row: dict) -> float:
    """Return a late-delivery probability in [0, 1] for one order."""
    raw = 0.0

    # Higher totals → heavier packages → more delay risk
    if row["order_total"] > 500:
        raw += 1.2
    elif row["order_total"] > 200:
        raw += 0.6

    # International shipments are riskier
    if row["ip_country"] != "US":
        raw += 1.5

    # Payment friction can delay processing
    if row["payment_method"] == "crypto":
        raw += 0.8
    elif row["payment_method"] == "bank":
        raw += 0.3

    # Promos sometimes cause warehouse re-picks
    if row["promo_used"]:
        raw += 0.4

    # Mobile orders have slightly higher address-error rates
    if row["device_type"] == "mobile":
        raw += 0.3

    return round(sigmoid(raw - 1.5), 4)  # centre around ~0.18 baseline


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(json.dumps({"error": f"Database not found: {DB_PATH}"}))
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Ensure the predictions table exists
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS order_predictions (
            prediction_id             INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id                  INTEGER NOT NULL UNIQUE,
            late_delivery_probability REAL    NOT NULL,
            predicted_late_delivery   INTEGER NOT NULL DEFAULT 0,
            prediction_timestamp      TEXT    NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
        """
    )

    orders = cur.execute(
        """
        SELECT order_id, order_total, ip_country, payment_method,
               promo_used, device_type
        FROM   orders
        """
    ).fetchall()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    scored = 0

    for order in orders:
        prob = score_order(dict(order))
        predicted_late = 1 if prob >= 0.5 else 0

        cur.execute(
            """
            INSERT INTO order_predictions
                (order_id, late_delivery_probability, predicted_late_delivery,
                 prediction_timestamp)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET
                late_delivery_probability = excluded.late_delivery_probability,
                predicted_late_delivery   = excluded.predicted_late_delivery,
                prediction_timestamp      = excluded.prediction_timestamp
            """,
            (order["order_id"], prob, predicted_late, now),
        )
        scored += 1

    conn.commit()
    conn.close()

    # Structured output for the Node API route to parse
    print(json.dumps({"scored": scored, "timestamp": now}))


if __name__ == "__main__":
    main()
