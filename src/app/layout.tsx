import type { Metadata } from "next";
import Link from "next/link";
import CustomerBanner from "./CustomerBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shop Dashboard",
  description: "IS 455 Deployment Assignment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CustomerBanner />
        <div className="layout">
          <nav className="sidebar">
            <h2>Shop DB</h2>
            <Link href="/select-customer">Select Customer</Link>
            <Link href="/dashboard">Customer Dashboard</Link>
            <Link href="/place-order">Place Order</Link>
            <Link href="/orders">Order History</Link>
            <Link href="/warehouse/priority">Fraud Detection</Link>
            <Link href="/scoring">Run Scoring</Link>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
