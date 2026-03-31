import { redirect } from "next/navigation";
import Link from "next/link";
import { queryAll } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";
import SuccessBanner from "./SuccessBanner";

/* ── Types ─────────────────────────────────────────────── */

interface OrderRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
}

/* ── SQL ───────────────────────────────────────────────── */
//
// SELECT o.order_id,
//        o.order_datetime,
//        o.order_total,
//        CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
// FROM   orders o
// LEFT JOIN shipments s ON s.order_id = o.order_id
// WHERE  o.customer_id = ?
// ORDER BY o.order_datetime DESC
//

/* ── Page ──────────────────────────────────────────────── */

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }

  const params = await searchParams;
  const successOrderId = params.success ?? null;

  const orders = queryAll<OrderRow>(
    `SELECT o.order_id,
            o.order_datetime,
            o.order_total,
            CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM   orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE  o.customer_id = ?
     ORDER BY o.order_datetime DESC`,
    [customerId]
  );

  return (
    <div>
      <h1>Order History</h1>

      {successOrderId && <SuccessBanner orderId={successOrderId} />}

      <p className="text-muted mb-1">{orders.length} orders found.</p>

      {orders.length === 0 ? (
        <div className="card">
          <p>No orders yet.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
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
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td>
                    <Link href={`/orders/${o.order_id}`}>#{o.order_id}</Link>
                  </td>
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
        </div>
      )}
    </div>
  );
}
