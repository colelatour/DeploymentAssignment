import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";

/* ── Types ─────────────────────────────────────────────── */

interface OrderRaw {
  order_id: number;
  order_datetime: string;
  order_total: number;
  shipments: { shipment_id: number }[] | null;
}

interface LineItemRaw {
  quantity: number;
  unit_price: number;
  line_total: number;
  products: { product_name: string };
}

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

  const { data: orderRaw } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("order_id", id)
    .eq("customer_id", customerId)
    .single<OrderRaw>();

  if (!orderRaw) {
    notFound();
  }

  const order = {
    order_id: orderRaw.order_id,
    order_datetime: orderRaw.order_datetime,
    order_total: orderRaw.order_total,
    fulfilled:
      orderRaw.shipments && orderRaw.shipments.length > 0 ? 1 : 0,
  };

  const { data: lineItemsRaw } = await supabase
    .from("order_items")
    .select("quantity, unit_price, line_total, products(product_name)")
    .eq("order_id", id)
    .order("order_item_id")
    .returns<LineItemRaw[]>();

  const lineItems = (lineItemsRaw ?? []).map((li) => ({
    product_name: li.products.product_name,
    quantity: li.quantity,
    unit_price: li.unit_price,
    line_total: li.line_total,
  }));

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
              <td>
                <strong>Date</strong>
              </td>
              <td>{order.order_datetime}</td>
            </tr>
            <tr>
              <td>
                <strong>Fulfilled</strong>
              </td>
              <td>
                <span
                  className={`badge ${order.fulfilled ? "green" : "yellow"}`}
                >
                  {order.fulfilled ? "Yes" : "Pending"}
                </span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Order Total</strong>
              </td>
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
