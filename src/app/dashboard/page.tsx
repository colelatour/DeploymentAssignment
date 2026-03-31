import { redirect } from "next/navigation";
import { queryOne, queryAll } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";

/* ── Types ─────────────────────────────────────────────── */

interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
  city: string;
  state: string;
  zip_code: string;
  customer_segment: string;
  loyalty_tier: string;
  created_at: string;
}

interface OrderSummary {
  total_orders: number;
  total_spent: number;
}

interface RecentOrder {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number; // 1 if a shipment row exists, 0 otherwise
}

/* ── SQL ───────────────────────────────────────────────── */

// Customer profile
// SELECT customer_id, full_name, email, city, state, zip_code,
//        customer_segment, loyalty_tier, created_at
// FROM   customers
// WHERE  customer_id = ?

// Aggregate totals
// SELECT COUNT(*)              AS total_orders,
//        COALESCE(SUM(order_total), 0) AS total_spent
// FROM   orders
// WHERE  customer_id = ?

// 5 most recent orders with fulfilment status
// SELECT o.order_id,
//        o.order_datetime,
//        o.order_total,
//        CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
// FROM   orders o
// LEFT JOIN shipments s ON s.order_id = o.order_id
// WHERE  o.customer_id = ?
// ORDER BY o.order_datetime DESC
// LIMIT  5

/* ── Page ──────────────────────────────────────────────── */

export default async function DashboardPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }

  const customer = queryOne<Customer>(
    `SELECT customer_id, full_name, email, city, state, zip_code,
            customer_segment, loyalty_tier, created_at
     FROM   customers
     WHERE  customer_id = ?`,
    [customerId]
  );

  if (!customer) {
    redirect("/select-customer");
  }

  const summary = queryOne<OrderSummary>(
    `SELECT COUNT(*)                       AS total_orders,
            COALESCE(SUM(order_total), 0)  AS total_spent
     FROM   orders
     WHERE  customer_id = ?`,
    [customerId]
  )!;

  const recentOrders = queryAll<RecentOrder>(
    `SELECT o.order_id,
            o.order_datetime,
            o.order_total,
            CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM   orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE  o.customer_id = ?
     ORDER BY o.order_datetime DESC
     LIMIT  5`,
    [customerId]
  );

  return (
    <div>
      <h1>Customer Dashboard</h1>

      {/* ── Profile card ──────────────────────────────── */}
      <div className="card">
        <h2>{customer.full_name}</h2>
        <p>{customer.email}</p>
        <p>
          {customer.city}, {customer.state} {customer.zip_code}
        </p>
        <p>
          Segment:{" "}
          <span className="badge blue">{customer.customer_segment}</span>
          &nbsp;&middot;&nbsp;Loyalty:{" "}
          <span className="badge green">{customer.loyalty_tier}</span>
        </p>
        <p className="text-muted">
          Member since {customer.created_at.slice(0, 10)}
        </p>
      </div>

      {/* ── Order summary card ────────────────────────── */}
      <div className="card">
        <h2>Order Summary</h2>
        <div className="flex-gap">
          <div>
            <strong>{summary.total_orders}</strong>
            <br />
            <span className="text-muted">Total Orders</span>
          </div>
          <div>
            <strong>${summary.total_spent.toFixed(2)}</strong>
            <br />
            <span className="text-muted">Total Spend</span>
          </div>
        </div>
      </div>

      {/* ── Recent orders table ───────────────────────── */}
      <div className="card">
        <h2>5 Most Recent Orders</h2>
        {recentOrders.length === 0 ? (
          <p className="text-muted">No orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Fulfilled</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.order_id}>
                  <td>{o.order_id}</td>
                  <td>{o.order_datetime}</td>
                  <td>
                    <span
                      className={`badge ${o.fulfilled ? "green" : "yellow"}`}
                    >
                      {o.fulfilled ? "Yes" : "Pending"}
                    </span>
                  </td>
                  <td>${o.order_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
