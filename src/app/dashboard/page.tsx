import { redirect } from "next/navigation";
import { supabase } from "@/lib/db";
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

interface OrderRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  shipments: { shipment_id: number }[] | null;
}

/* ── Page ──────────────────────────────────────────────── */

export default async function DashboardPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select(
      "customer_id, full_name, email, city, state, zip_code, customer_segment, loyalty_tier, created_at"
    )
    .eq("customer_id", customerId)
    .single<Customer>();

  if (!customer) {
    redirect("/select-customer");
  }

  // Fetch all orders for summary stats
  const { data: allOrders } = await supabase
    .from("orders")
    .select("order_total")
    .eq("customer_id", customerId);

  const totalOrders = allOrders?.length ?? 0;
  const totalSpent =
    allOrders?.reduce((sum, o) => sum + o.order_total, 0) ?? 0;

  // Fetch 5 most recent orders with fulfillment status
  const { data: recentRaw } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false })
    .limit(5)
    .returns<OrderRow[]>();

  const recentOrders = (recentRaw ?? []).map((o) => ({
    order_id: o.order_id,
    order_datetime: o.order_datetime,
    order_total: o.order_total,
    fulfilled: o.shipments && o.shipments.length > 0 ? 1 : 0,
  }));

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
            <strong>{totalOrders}</strong>
            <br />
            <span className="text-muted">Total Orders</span>
          </div>
          <div>
            <strong>${totalSpent.toFixed(2)}</strong>
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
