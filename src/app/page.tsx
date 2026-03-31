import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>Welcome to Shop Dashboard</h1>
      <p className="text-muted mb-1">
        IS 455 Deployment Assignment — a Next.js + SQLite web app.
      </p>
      <div className="card">
        <h2>Get Started</h2>
        <p>
          <Link href="/select-customer">Select a customer</Link> to begin
          browsing the dashboard, placing orders, or viewing order history.
        </p>
      </div>
    </div>
  );
}
