import glob
import os
from typing import Any, Dict, List

import joblib
import pandas as pd


ARTIFACT_DIR = "artifacts"
MODEL_FILENAME = "fraud_xgboost_model.sav"  # default if you save one fixed name
MODEL_PATTERN = "fraud_xgboost*.sav"        # fallback if you version files

# In-memory cache so the app does not reload model every request
_MODEL_CACHE = {"model": None, "path": None}


def _find_model_path() -> str:
    fixed = os.path.join(ARTIFACT_DIR, MODEL_FILENAME)
    if os.path.exists(fixed):
        return fixed

    matches = glob.glob(os.path.join(ARTIFACT_DIR, MODEL_PATTERN))
    if not matches:
        # also check current directory as backup
        if os.path.exists(MODEL_FILENAME):
            return MODEL_FILENAME
        raise FileNotFoundError("No XGBoost .sav model found.")
    return max(matches, key=os.path.getmtime)


def load_model(force_reload: bool = False):
    model_path = _find_model_path()
    if force_reload or _MODEL_CACHE["model"] is None or _MODEL_CACHE["path"] != model_path:
        _MODEL_CACHE["model"] = joblib.load(model_path)
        _MODEL_CACHE["path"] = model_path
    return _MODEL_CACHE["model"], model_path


def _required_columns() -> List[str]:
    # Must match training features exactly (X columns used at fit time)
    return [
        "billing_zip",
        "shipping_zip",
        "shipping_state",
        "payment_method",
        "device_type",
        "ip_country",
        "promo_used",
        "order_subtotal",
        "shipping_fee",
        "tax_amount",
        "order_total",
        "risk_score",
        "gender",
        "city",
        "customer_state",
        "customer_segment",
        "loyalty_tier",
        "customer_is_active",
        "carrier",
        "shipping_method",
        "distance_band",
        "promised_days",
        "actual_days",
        "late_delivery",
        "total_units",
        "line_items",
        "distinct_products",
        "avg_unit_price",
        "line_total_sum",
        "customer_age",
        "order_hour",
        "order_dayofweek",
    ]


def _payload_to_dataframe(payload: Dict[str, Any]) -> pd.DataFrame:
    missing = [c for c in _required_columns() if c not in payload]
    if missing:
        raise ValueError(f"Missing required fields: {missing}")

    # Keep strict column order
    ordered_payload = {c: payload[c] for c in _required_columns()}
    return pd.DataFrame([ordered_payload])


def predict_transaction(payload: Dict[str, Any]) -> Dict[str, Any]:
    model, model_path = load_model()
    X_new = _payload_to_dataframe(payload)

    pred = int(model.predict(X_new)[0])                 # 0 or 1
    proba = float(model.predict_proba(X_new)[0, 1])     # P(fraud=1)

    return {
        "model_path": model_path,
        "is_fraud": pred,
        "fraud_probability": round(proba, 6),
    }