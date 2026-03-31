# Shop Dashboard — IS 455 Deployment Assignment

A Next.js (App Router) + SQLite web app for browsing customers, placing orders, viewing order history, managing a warehouse priority queue, and running fraud-risk scoring.

## Prerequisites

- Node.js 18+
- npm

## Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

| Route | Description |
|---|---|
| `/select-customer` | Pick a customer to act as (stored in cookie) |
| `/dashboard` | View customer profile and order summary |
| `/place-order` | Add products to cart and place a new order |
| `/order-history` | View all orders for the selected customer |
| `/warehouse` | Warehouse priority queue (late deliveries) |
| `/scoring` | Run a rule-based risk scoring model on all orders |

## Tech Stack

- **Next.js 15** (App Router, server components)
- **better-sqlite3** for direct SQLite access
- **shop.db** at project root (pre-populated with 250 customers, 100 products, 5000 orders)

## Build for Production

```bash
npm run build
npm start
```
