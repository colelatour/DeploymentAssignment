-- Run this in the Supabase SQL Editor AFTER importing data.
-- Creates a view used by the Fraud Detection Queue page.

CREATE OR REPLACE VIEW fraud_queue AS
SELECT
  o.order_id,
  o.order_datetime,
  o.order_total,
  CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled,
  c.customer_id,
  c.full_name AS customer_name,
  p.fraud_probability,
  p.predicted_fraud,
  p.prediction_timestamp
FROM orders o
JOIN customers c        ON c.customer_id = o.customer_id
JOIN order_predictions p ON p.order_id    = o.order_id
LEFT JOIN shipments s   ON s.order_id     = o.order_id;
