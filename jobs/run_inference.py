"""
Fraud prediction scoring job.

Reads every order from Supabase, builds the 32-feature payload required
by the XGBoost model (via modeling.py), and upserts fraud predictions
into order_predictions. Falls back to simple heuristics if the .sav
model file is not found.

Output (parsed by the Node API route):
  {"scored": <int>, "timestamp": "<ISO 8601>"}
"""

import json
import math
import os
import sys
import traceback
from datetime import datetime, timezone

# Allow importing modeling.py from the project root
PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, PROJECT_ROOT)


def _load_env_local() -> None:
    """Parse .env.local and inject missing vars into os.environ (local dev fallback)."""
    env_path = os.path.join(PROJECT_ROOT, ".env.local")
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def get_supabase_client():
    _load_env_local()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
    if not url or not key:
        print(json.dumps({"error": "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"}))
        sys.exit(1)
    try:
        from supabase import create_client
    except ImportError:
        print(json.dumps({"error": "supabase package not installed. Run: pip install supabase"}))
        sys.exit(1)
    return create_client(url, key)


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


def parse_datetime(value: str | None, fmt: str = "%Y-%m-%dT%H:%M:%S") -> datetime | None:
    """Parse a datetime string from Supabase (ISO 8601 variants)."""
    if not value:
        return None
    # Try common Supabase formats
    for f in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value[:26], f[:len(f)])
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def main() -> None:
    client = get_supabase_client()

    # Try to import modeling.py and load the model
    use_model = False
    try:
        from modeling import predict_transaction, load_model
        load_model()  # will raise FileNotFoundError if .sav missing
        use_model = True
        print(json.dumps({"info": "Using XGBoost model via modeling.py"}), file=sys.stderr)
    except (ImportError, FileNotFoundError) as e:
        print(json.dumps({"info": f"Model not available, using heuristic fallback: {e}"}), file=sys.stderr)

    # Fetch all orders with nested customer and shipment data
    orders_resp = client.table("orders").select(
        "order_id, billing_zip, shipping_zip, shipping_state, payment_method, "
        "device_type, ip_country, promo_used, order_subtotal, shipping_fee, "
        "tax_amount, order_total, risk_score, order_datetime, customer_id, "
        "customers(gender, city, state, customer_segment, loyalty_tier, is_active, birthdate), "
        "shipments(carrier, shipping_method, distance_band, promised_days, actual_days, late_delivery)"
    ).execute()

    orders = orders_resp.data or []

    # Fetch all order_items and aggregate by order_id in Python
    items_resp = client.table("order_items").select(
        "order_id, quantity, unit_price, product_id, line_total"
    ).execute()

    items_by_order: dict[int, dict] = {}
    for item in (items_resp.data or []):
        oid = item["order_id"]
        if oid not in items_by_order:
            items_by_order[oid] = {
                "total_units": 0,
                "line_items": 0,
                "distinct_products": set(),
                "unit_prices": [],
                "line_total_sum": 0.0,
            }
        agg = items_by_order[oid]
        agg["total_units"] += item.get("quantity") or 0
        agg["line_items"] += 1
        if item.get("product_id"):
            agg["distinct_products"].add(item["product_id"])
        if item.get("unit_price") is not None:
            agg["unit_prices"].append(item["unit_price"])
        agg["line_total_sum"] += item.get("line_total") or 0.0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    scored = 0
    errors = 0
    predictions = []

    for order in orders:
        customer = order.get("customers") or {}
        shipment = order.get("shipments") or {}
        agg = items_by_order.get(order["order_id"], {})

        row = {
            "order_id":          order["order_id"],
            "billing_zip":       order.get("billing_zip") or "",
            "shipping_zip":      order.get("shipping_zip") or "",
            "shipping_state":    order.get("shipping_state") or "",
            "payment_method":    order.get("payment_method") or "card",
            "device_type":       order.get("device_type") or "desktop",
            "ip_country":        order.get("ip_country") or "US",
            "promo_used":        order.get("promo_used") or 0,
            "order_subtotal":    order.get("order_subtotal") or 0.0,
            "shipping_fee":      order.get("shipping_fee") or 0.0,
            "tax_amount":        order.get("tax_amount") or 0.0,
            "order_total":       order.get("order_total") or 0.0,
            "risk_score":        order.get("risk_score") or 0.0,
            "order_datetime":    order.get("order_datetime") or "",
            "gender":            customer.get("gender") or "Unknown",
            "city":              customer.get("city") or "",
            "customer_state":    customer.get("state") or "",
            "customer_segment":  customer.get("customer_segment") or "standard",
            "loyalty_tier":      customer.get("loyalty_tier") or "none",
            "customer_is_active": customer.get("is_active") if customer.get("is_active") is not None else 1,
            "birthdate":         customer.get("birthdate"),
            "carrier":           shipment.get("carrier") or "USPS",
            "shipping_method":   shipment.get("shipping_method") or "standard",
            "distance_band":     shipment.get("distance_band") or "regional",
            "promised_days":     shipment.get("promised_days") if shipment.get("promised_days") is not None else 5,
            "actual_days":       shipment.get("actual_days") if shipment.get("actual_days") is not None else 5,
            "late_delivery":     shipment.get("late_delivery") if shipment.get("late_delivery") is not None else 0,
            "total_units":       agg.get("total_units") or 0,
            "line_items":        agg.get("line_items") or 0,
            "distinct_products": len(agg.get("distinct_products") or set()),
            "avg_unit_price":    (sum(agg["unit_prices"]) / len(agg["unit_prices"])) if agg.get("unit_prices") else 0.0,
            "line_total_sum":    agg.get("line_total_sum") or 0.0,
        }

        if use_model:
            try:
                from datetime import date
                if row["birthdate"]:
                    birth = datetime.strptime(row["birthdate"][:10], "%Y-%m-%d").date()
                    order_date_str = row["order_datetime"][:10]
                    order_date = datetime.strptime(order_date_str, "%Y-%m-%d").date()
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
        scored += 1

    # Batch upsert all predictions to Supabase
    if predictions:
        client.table("order_predictions").upsert(
            predictions,
            on_conflict="order_id"
        ).execute()

    output = {"scored": scored, "timestamp": now}
    if errors:
        output["model_errors"] = errors
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc), "traceback": traceback.format_exc()}))
        sys.exit(1)
