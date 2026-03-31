import { queryAll, tableExists } from "@/lib/db";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────── */

interface QueueRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
  customer_id: number;
  customer_name: string;
  late_delivery_probability: number;
  predicted_late_delivery: number;
  prediction_timestamp: string;
}

/* ── Page ──────────────────────────────────────────────── */

export default function WarehousePriorityPage() {
  if (!tableExists("order_predictions")) {
    return (
      <div>
        <h1>Late Delivery Priority Queue</h1>
        <div className="card" style={{ borderColor: "var(--warning)" }}>
          <h2>Missing Table</h2>
          <p>
            The <code>order_predictions</code> table does not exist yet. To
            create it, go to <Link href="/scoring">Run Scoring</Link> and click
            the button, or run:
          </p>
          <pre
            style={{
              background: "#f1f5f9",
              padding: "0.75rem",
              borderRadius: "6px",
              fontSize: "0.85rem",
              marginTop: "0.5rem",
            }}
          >
            sqlite3 shop.db &lt; scripts/seed-predictions.sql
          </pre>
        </div>
      </div>
    );
  }

  const queue = queryAll<QueueRow>(
    `SELECT
       o.order_id,
       o.order_datetime,
       o.order_total,
       CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled,
       c.customer_id,
       c.full_name                            AS customer_name,
       p.late_delivery_probability,
       p.predicted_late_delivery,
       p.prediction_timestamp
     FROM orders o
     JOIN customers c        ON c.customer_id = o.customer_id
     JOIN order_predictions p ON p.order_id    = o.order_id
     LEFT JOIN shipments s   ON s.order_id     = o.order_id
     WHERE s.shipment_id IS NULL
     ORDER BY p.late_delivery_probability DESC,
              o.order_datetime ASC
     LIMIT 50`
  );

  return (
    <div>
      <h1>Late Delivery Priority Queue</h1>

      <div className="card">
        <p>
          This queue surfaces unfulfilled orders most likely to arrive late,
          ranked by the predicted probability of late delivery. Warehouse staff
          should prioritise picking, packing, and dispatching orders at the top
          of the list first to minimise the number of late shipments and improve
          customer satisfaction.
        </p>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <p className="text-muted text-center">
            No unfulfilled orders with predictions found. Place a new order via{" "}
            <Link href="/place-order">Place Order</Link>, then{" "}
            <Link href="/scoring">Run Scoring</Link> to see it appear here.
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Total</th>
                <th>Fulfilled</th>
                <th>Late Prob.</th>
                <th>Predicted Late</th>
                <th>Scored At</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.order_id}>
                  <td>{q.order_id}</td>
                  <td>{q.customer_name}</td>
                  <td>{q.order_datetime}</td>
                  <td>${q.order_total.toFixed(2)}</td>
                  <td>
                    <span
                      className={`badge ${q.fulfilled ? "green" : "yellow"}`}
                    >
                      {q.fulfilled ? "Yes" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        q.late_delivery_probability >= 0.7
                          ? "red"
                          : q.late_delivery_probability >= 0.4
                          ? "yellow"
                          : "green"
                      }`}
                    >
                      {(q.late_delivery_probability * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        q.predicted_late_delivery ? "red" : "green"
                      }`}
                    >
                      {q.predicted_late_delivery ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="text-muted">{q.prediction_timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
