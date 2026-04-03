"""
Vercel Python serverless function for fraud scoring.
Receives order data as JSON, runs XGBoost inference, returns predictions.
"""

import json
import math
import os
import sys
import traceback
from datetime import datetime, timezone

from flask import Flask, request, jsonify

PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, PROJECT_ROOT)

app = Flask(__name__)

# Load model at cold-start
use_model = False
try:
    from modeling import predict_transaction, load_model
    load_model()
    use_model = True
except (ImportError, FileNotFoundError):
    pass


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def score_heuristic(row):
    raw = 0.0
    if row.get("order_total", 0) > 500:
        raw += 1.2
    elif row.get("order_total", 0) > 200:
        raw += 0.6
    if row.get("ip_country") != "US":
        raw += 1.5
    if row.get("payment_method") == "crypto":
        raw += 0.8
    elif row.get("payment_method") == "bank":
        raw += 0.3
    if row.get("promo_used"):
        raw += 0.4
    if row.get("device_type") == "mobile":
        raw += 0.3
    risk_score = row.get("risk_score") or 0
    if risk_score > 70:
        raw += 1.5
    elif risk_score > 40:
        raw += 0.7
    return round(sigmoid(raw - 1.5), 4)


def parse_dt(value):
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


@app.get("/api/score")
def health():
    return jsonify({"status": "ok", "model": "xgboost" if use_model else "heuristic"})


@app.post("/api/score")
def score():
    try:
        orders = request.json.get("orders", [])
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
                    dt = parse_dt(row["order_datetime"])
                    payload = {**row, "customer_age": age,
                               "order_hour": dt.hour if dt else 12,
                               "order_dayofweek": dt.weekday() if dt else 0}
                    result = predict_transaction(payload)
                    prob = result["fraud_probability"]
                    predicted_fraud = result["is_fraud"]
                except Exception:
                    errors += 1
                    prob = score_heuristic(row)
                    predicted_fraud = 1 if prob >= 0.5 else 0
            else:
                prob = score_heuristic(row)
                predicted_fraud = 1 if prob >= 0.5 else 0

            predictions.append({
                "order_id":             row["order_id"],
                "fraud_probability":    prob,
                "predicted_fraud":      predicted_fraud,
                "prediction_timestamp": now,
            })

        resp = {"scored": len(predictions), "predictions": predictions, "timestamp": now}
        if errors:
            resp["model_errors"] = errors
        return jsonify(resp)

    except Exception as exc:
        return jsonify({"error": str(exc), "traceback": traceback.format_exc()}), 500
