"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbError =
    error.message.includes("Database not found") ||
    error.message.includes("no such table") ||
    error.message.includes("SQLITE");

  return (
    <div className="card" style={{ borderColor: "var(--danger)" }}>
      <h1 style={{ color: "var(--danger)" }}>Something went wrong</h1>

      {isDbError ? (
        <>
          <p>
            <strong>Database error:</strong> {error.message}
          </p>
          <p className="text-muted mt-1">
            Make sure <code>shop.db</code> exists in the project root and
            contains the expected tables. If the{" "}
            <code>order_predictions</code> table is missing, run:
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
        </>
      ) : (
        <p>{error.message}</p>
      )}

      <button className="primary mt-1" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
