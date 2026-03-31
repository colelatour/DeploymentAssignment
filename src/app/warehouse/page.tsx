import { queryAll } from "@/lib/db";

interface QueueItem {
  order_id: number;
  order_datetime: string;
  full_name: string;
  shipping_state: string;
  order_total: number;
  item_count: number;
  shipping_method: string;
  carrier: string;
  promised_days: number;
  days_since_order: number;
  priority: string;
}

export default function WarehousePage() {
  const queue = queryAll<QueueItem>(
    `SELECT o.order_id, o.order_datetime, c.full_name, o.shipping_state,
            o.order_total,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) as item_count,
            s.shipping_method, s.carrier, s.promised_days,
            CAST(julianday('now') - julianday(o.order_datetime) AS INTEGER) as days_since_order,
            CASE
              WHEN s.shipping_method = 'overnight' THEN 'URGENT'
              WHEN s.shipping_method = 'expedited' THEN 'HIGH'
              ELSE 'NORMAL'
            END as priority
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     JOIN shipments s ON s.order_id = o.order_id
     WHERE s.late_delivery = 1
     ORDER BY
       CASE s.shipping_method
         WHEN 'overnight' THEN 1
         WHEN 'expedited' THEN 2
         ELSE 3
       END,
       o.order_datetime ASC
     LIMIT 50`
  );

  return (
    <div>
      <h1>Warehouse Priority Queue</h1>
      <p className="text-muted mb-1">
        Orders with late deliveries, prioritized by shipping method.
      </p>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Order #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>State</th>
              <th>Items</th>
              <th>Total</th>
              <th>Carrier</th>
              <th>Method</th>
              <th>Promised</th>
              <th>Days Ago</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.order_id}>
                <td>
                  <span
                    className={`badge ${
                      q.priority === "URGENT"
                        ? "red"
                        : q.priority === "HIGH"
                        ? "yellow"
                        : "blue"
                    }`}
                  >
                    {q.priority}
                  </span>
                </td>
                <td>{q.order_id}</td>
                <td>{q.full_name}</td>
                <td>{q.order_datetime.slice(0, 10)}</td>
                <td>{q.shipping_state}</td>
                <td>{q.item_count}</td>
                <td>${q.order_total.toFixed(2)}</td>
                <td>{q.carrier}</td>
                <td>{q.shipping_method}</td>
                <td>{q.promised_days}d</td>
                <td>{q.days_since_order}d</td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.length === 0 && (
          <p className="text-muted text-center mt-1">No late deliveries found.</p>
        )}
      </div>
    </div>
  );
}
