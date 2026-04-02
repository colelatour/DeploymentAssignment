"""
Fraud prediction scoring job.

Reads order data from stdin as a JSON array, scores each order using the
XGBoost model (via modeling.py), and writes predictions to stdout as JSON.
Falls back to simple heuristics if the .sav model file is not found.

Input (stdin):  JSON array of order objects
Output (stdout): {"scored": <int>, "predictions": [...], "timestamp": "<ISO>"}
"""

import json
import math
import os
import sys
import traceback
from datetime import datetime, timezone

PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, PROJECT_ROOT)


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def score_order_heuristic(row: dict) -> float:
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


def parse_datetime(value):
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value[:26], fmt[:len(fmt)])
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def main():
    # Read order data from stdin (provided by the Node.js API route)
    raw = sys.stdin.read()
    orders = json.loads(raw)

    # Try to load the XGBoost model
    use_model = False
    try:
        from modeling import predict_transaction, load_model
        load_model()
        use_model = True
        print(json.dumps({"info": "Using XGBoost model"}), file=sys.stderr)
    except (ImportError, FileNotFoundError) as e:
        print(json.dumps({"info": f"Using heuristic fallback: {e}"}), file=sys.stderr)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    predictions = []
    errors = 0

    for order in orders:
        row = {
            "order_id":           order.get("order_id"),
            "billing_zip":        order.get("billing_zip") or "",
            "shipping_zip":       order.get("shipping_zip") or "",
            "shipping_state":     order.get("shipping_state") or "",
            "payment_method":     order.get("payment_method") or "card",
            "device_type":        order.get("device_type") or "desktop",
            "ip_country":         order.get("ip_country") or "US",
            "promo_used":         order.get("promo_used") or 0,
            "order_subtotal":     order.get("order_subtotal") or 0.0,
            "shipping_fee":       order.get("shipping_fee") or 0.0,
            "tax_amount":         order.get("tax_amount") or 0.0,
            "order_total":        order.get("order_total") or 0.0,
            "risk_score":         order.get("risk_score") or 0.0,
            "order_datetime":     order.get("order_datetime") or "",
            "gender":             order.get("gender") or "Unknown",
            "city":               order.get("city") or "",
            "customer_state":     order.get("customer_state") or "",
            "customer_segment":   order.get("customer_segment") or "standard",
            "loyalty_tier":       order.get("loyalty_tier") or "none",
            "customer_is_active": order.get("customer_is_active") if order.get("customer_is_active") is not None else 1,
            "birthdate":          order.get("birthdate"),
            "carrier":            order.get("carrier") or "USPS",
            "shipping_method":    order.get("shipping_method") or "standard",
            "distance_band":      order.get("distance_band") or "regional",
            "promised_days":      order.get("promised_days") if order.get("promised_days") is not None else 5,
            "actual_days":        order.get("actual_days") if order.get("actual_days") is not None else 5,
            "late_delivery":      order.get("late_delivery") if order.get("late_delivery") is not None else 0,
            "total_units":        order.get("total_units") or 0,
            "line_items":         order.get("line_items") or 0,
            "distinct_products":  order.get("distinct_products") or 0,
            "avg_unit_price":     order.get("avg_unit_price") or 0.0,
            "line_total_sum":     order.get("line_total_sum") or 0.0,
        }

        if use_model:
            try:
                if row["birthdate"]:
                    birth = datetime.strptime(row["birthdate"][:10], "%Y-%m-%d").date()
                    order_date = datetime.strptime(row["order_datetime"][:10], "%Y-%m-%d").date()
                    age = (order_date - birth).days // 365
                else:
                    age = 30

                order_dt = parse_datetime(row["order_datetime"])
                order_hour = order_dt.hour if order_dt else 12
                order_dayofweek = order_dt.weekday() if order_dt else 0

                payload = {**row, "customer_age": age, "order_hour": order_hour, "order_dayofweek": order_dayofweek}
                result = predict_transaction(payload)
                prob = result["fraud_probability"]
                predicted_fraud = result["is_fraud"]
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(json.dumps({"warning": f"Model error on order {row['order_id']}: {e}"}), file=sys.stderr)
                prob = score_order_heuristic(row)
                predicted_fraud = 1 if prob >= 0.5 else 0
        else:
            prob = score_order_heuristic(row)
            predicted_fraud = 1 if prob >= 0.5 else 0

        predictions.append({
            "order_id":             row["order_id"],
            "fraud_probability":    prob,
            "predicted_fraud":      predicted_fraud,
            "prediction_timestamp": now,
        })

    output = {"scored": len(predictions), "predictions": predictions, "timestamp": now}
    if errors:
        output["model_errors"] = errors
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc), "traceback": traceback.format_exc()}))
        sys.exit(1)
