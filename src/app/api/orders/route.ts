import { NextRequest, NextResponse } from "next/server";
import { run, queryOne, transaction } from "@/lib/db";

interface LineItem {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    customer_id,
    items,
  }: {
    customer_id: number;
    items: LineItem[];
  } = body;

  /* ── Validation ──────────────────────────────────────── */

  if (!customer_id || !Number.isInteger(customer_id)) {
    return NextResponse.json({ error: "Invalid customer_id" }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "At least one line item is required" },
      { status: 400 }
    );
  }

  for (const item of items) {
    if (
      !Number.isInteger(item.product_id) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      typeof item.unit_price !== "number" ||
      item.unit_price <= 0
    ) {
      return NextResponse.json(
        { error: `Invalid line item: product_id=${item.product_id}` },
        { status: 400 }
      );
    }
  }

  const customer = queryOne<{ zip_code: string; state: string }>(
    "SELECT zip_code, state FROM customers WHERE customer_id = ?",
    [customer_id]
  );
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  /* ── Compute totals ──────────────────────────────────── */

  // total_value = sum of (price * quantity) across all line items
  const totalValue = items.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0
  );
  const tax = totalValue * 0.08;
  const shipping = totalValue > 100 ? 0 : 9.99;
  const orderTotal = totalValue + tax + shipping;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  /* ── Transactional insert ────────────────────────────── */
  //
  // INSERT INTO orders  (...) VALUES (...)   -- one row
  // INSERT INTO order_items (...) VALUES (...)  -- one row per line item
  //
  // Both run inside a single transaction so either all succeed
  // or nothing is written.

  try {
    const orderId = transaction(() => {
      const orderResult = run(
        `INSERT INTO orders
           (customer_id, order_datetime, billing_zip, shipping_zip,
            shipping_state, payment_method, device_type, ip_country,
            promo_used, order_subtotal, shipping_fee, tax_amount,
            order_total, risk_score, is_fraud)
         VALUES (?, ?, ?, ?, ?, 'card', 'desktop', 'US', 0,
                 ?, ?, ?, ?, 0, 0)`,
        [
          customer_id,
          now,
          customer.zip_code,
          customer.zip_code,
          customer.state,
          totalValue,
          shipping,
          tax,
          orderTotal,
        ]
      );

      const id = orderResult.lastInsertRowid;

      for (const item of items) {
        const lineTotal = item.unit_price * item.quantity;
        run(
          `INSERT INTO order_items
             (order_id, product_id, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.product_id, item.quantity, item.unit_price, lineTotal]
        );
      }

      return id;
    });

    return NextResponse.json({ order_id: Number(orderId) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Transaction failed: ${message}` },
      { status: 500 }
    );
  }
}
