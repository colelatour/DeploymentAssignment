import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { queryOne, queryAll } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";

/* ── Types ─────────────────────────────────────────────── */

interface Order {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
}

interface LineItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/* ── SQL ───────────────────────────────────────────────── */
//
// -- Order header (verified against customer_id for safety)
// SELECT o.order_id,
//        o.order_datetime,
//        o.order_total,
//        CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
// FROM   orders o
// LEFT JOIN shipments s ON s.order_id = o.order_id
// WHERE  o.order_id = ? AND o.customer_id = ?
//
// -- Line items
// SELECT p.product_name,
//        oi.quantity,
//        oi.unit_price,
//        oi.line_total
// FROM   order_items oi
// JOIN   products p ON p.product_id = oi.product_id
// WHERE  oi.order_id = ?
// ORDER BY oi.order_item_id
//

/* ── Page ──────────────────────────────────────────────── */

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }

  const { orderId } = await params;
  const id = Number(orderId);
  if (!Number.isInteger(id)) {
    notFound();
  }

  const order = queryOne<Order>(
    `SELECT o.order_id,
            o.order_datetime,
            o.order_total,
            CASE WHEN s.shipment_id IS NOT NULL THEN 1 ELSE 0 END AS fulfilled
     FROM   orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE  o.order_id = ? AND o.customer_id = ?`,
    [id, customerId]
  );

  if (!order) {
    notFound();
  }

  const lineItems = queryAll<LineItem>(
    `SELECT p.product_name,
            oi.quantity,
            oi.unit_price,
            oi.line_total
     FROM   order_items oi
     JOIN   products p ON p.product_id = oi.product_id
     WHERE  oi.order_id = ?
     ORDER BY oi.order_item_id`,
    [id]
  );

  return (
    <div>
      <p className="mb-1">
        <Link href="/orders">&larr; Back to Order History</Link>
      </p>

      <h1>Order #{order.order_id}</h1>

      <div className="card">
        <table>
          <tbody>
            <tr>
              <td><strong>Date</strong></td>
              <td>{order.order_datetime}</td>
            </tr>
            <tr>
              <td><strong>Fulfilled</strong></td>
              <td>
                <span
                  className={`badge ${order.fulfilled ? "green" : "yellow"}`}
                >
                  {order.fulfilled ? "Yes" : "Pending"}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Order Total</strong></td>
              <td>${order.order_total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Line Items</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i}>
                <td>{li.product_name}</td>
                <td>{li.quantity}</td>
                <td>${li.unit_price.toFixed(2)}</td>
                <td>${li.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
