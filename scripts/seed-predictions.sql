-- Creates the order_predictions table and seeds it with demo data.
-- Run with:  sqlite3 shop.db < scripts/seed-predictions.sql

CREATE TABLE IF NOT EXISTS order_predictions (
  prediction_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id             INTEGER NOT NULL UNIQUE,
  fraud_probability    REAL    NOT NULL,
  predicted_fraud      INTEGER NOT NULL DEFAULT 0,
  prediction_timestamp TEXT    NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_order ON order_predictions(order_id);

-- Seed a deterministic pseudo-random probability for every order
INSERT OR IGNORE INTO order_predictions
  (order_id, fraud_probability, predicted_fraud, prediction_timestamp)
SELECT
  o.order_id,
  ROUND(ABS(CAST(o.order_id * 7 + 13 AS REAL) % 100) / 100.0, 2),
  CASE WHEN ABS(CAST(o.order_id * 7 + 13 AS REAL) % 100) / 100.0 >= 0.5
       THEN 1 ELSE 0 END,
  datetime('now')
FROM orders o;
