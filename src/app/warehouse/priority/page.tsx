import { supabase } from "@/lib/db";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────── */

interface QueueRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
  customer_id: number;
  customer_name: string;
  fraud_probability: number;
  predicted_fraud: number;
  prediction_timestamp: string;
}

/* ── Page ──────────────────────────────────────────────── */

export default async function WarehousePriorityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort = sortParam === "recent" ? "recent" : "fraud";

  const orderCol =
    sort === "recent" ? "order_datetime" : "fraud_probability";
  const ascending = sort === "recent" ? false : false;

  const { data: queue, error } = await supabase
    .from("fraud_queue")
    .select("*")
    .order(orderCol, { ascending })
    .limit(50)
    .returns<QueueRow[]>();

  if (error) {
    return (
      <div>
        <h1>Fraud Detection Queue</h1>
        <div className="card" style={{ borderColor: "var(--warning)" }}>
          <h2>Setup Required</h2>
          <p>
            The <code>fraud_queue</code> view or <code>order_predictions</code>{" "}
            table is not set up yet. Run scoring first via{" "}
            <Link href="/scoring">Run Scoring</Link>, then create the view in
            the Supabase SQL Editor using{" "}
            <code>scripts/supabase-views.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  const rows = queue ?? [];

  return (
    <div>
      <h1>Fraud Detection Queue</h1>

      <div className="card">
        <p>
          This queue surfaces orders most likely to be fraudulent, ranked by the
          predicted probability of fraud. Review staff should investigate orders
          at the top of the list first to minimise losses and protect customers.
        </p>

        <fieldset style={{ marginTop: "0.75rem", border: "none", padding: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
            Sort by:
          </legend>
          <div style={{ display: "flex", gap: "1rem" }}>
            <Link
              href="/warehouse/priority?sort=fraud"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: "2px solid #6366f1",
                  background: sort === "fraud" ? "#6366f1" : "transparent",
                  boxShadow:
                    sort === "fraud" ? "inset 0 0 0 3px white" : "none",
                }}
              />
              Most Likely Fraud
            </Link>
            <Link
              href="/warehouse/priority?sort=recent"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: "2px solid #6366f1",
                  background: sort === "recent" ? "#6366f1" : "transparent",
                  boxShadow:
                    sort === "recent" ? "inset 0 0 0 3px white" : "none",
                }}
              />
              Most Recent
            </Link>
          </div>
        </fieldset>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="text-muted text-center">
            No orders with predictions found. Place a new order via{" "}
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
                <th>Fraud Prob.</th>
                <th>Predicted Fraud</th>
                <th>Scored At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
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
                        q.fraud_probability >= 0.7
                          ? "red"
                          : q.fraud_probability >= 0.4
                          ? "yellow"
                          : "green"
                      }`}
                    >
                      {(q.fraud_probability * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${q.predicted_fraud ? "red" : "green"}`}
                    >
                      {q.predicted_fraud ? "Yes" : "No"}
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
