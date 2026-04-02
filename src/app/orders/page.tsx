import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";
import SuccessBanner from "./SuccessBanner";

/* ── Types ─────────────────────────────────────────────── */

interface OrderRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  shipments: { shipment_id: number }[] | null;
}

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

  const { data: rawOrders } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false })
    .returns<OrderRow[]>();

  const orders = (rawOrders ?? []).map((o) => ({
    order_id: o.order_id,
    order_datetime: o.order_datetime,
    order_total: o.order_total,
    fulfilled: o.shipments && o.shipments.length > 0 ? 1 : 0,
  }));

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
