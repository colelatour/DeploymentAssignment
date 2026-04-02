import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

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

  const { data: customer } = await supabase
    .from("customers")
    .select("zip_code, state")
    .eq("customer_id", customer_id)
    .single<{ zip_code: string; state: string }>();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  /* ── Compute totals ──────────────────────────────────── */

  const totalValue = items.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0
  );
  const tax = totalValue * 0.08;
  const shipping = totalValue > 100 ? 0 : 9.99;
  const orderTotal = totalValue + tax + shipping;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  /* ── Insert order ────────────────────────────────────── */

  try {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id,
        order_datetime: now,
        billing_zip: customer.zip_code,
        shipping_zip: customer.zip_code,
        shipping_state: customer.state,
        payment_method: "card",
        device_type: "desktop",
        ip_country: "US",
        promo_used: 0,
        order_subtotal: totalValue,
        shipping_fee: shipping,
        tax_amount: tax,
        order_total: orderTotal,
        risk_score: 0,
        is_fraud: 0,
      })
      .select("order_id")
      .single<{ order_id: number }>();

    if (orderError || !orderData) {
      throw new Error(orderError?.message ?? "Failed to insert order");
    }

    const orderId = orderData.order_id;

    // Insert line items
    const lineItems = items.map((item) => ({
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.unit_price * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(lineItems);

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    return NextResponse.json({ order_id: orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Transaction failed: ${message}` },
      { status: 500 }
    );
  }
}
