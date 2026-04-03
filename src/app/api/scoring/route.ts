import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function POST() {
  try {
    // 1. Fetch all data from Supabase
    const [ordersRes, itemsRes] = await Promise.all([
      supabase.from("orders").select(
        "order_id, billing_zip, shipping_zip, shipping_state, payment_method, " +
        "device_type, ip_country, promo_used, order_subtotal, shipping_fee, " +
        "tax_amount, order_total, risk_score, order_datetime, " +
        "customers(gender, city, state, customer_segment, loyalty_tier, is_active, birthdate), " +
        "shipments(carrier, shipping_method, distance_band, promised_days, actual_days, late_delivery)"
      ),
      supabase.from("order_items").select("order_id, quantity, unit_price, product_id, line_total"),
    ]);

    if (ordersRes.error) throw new Error(`Supabase orders error: ${ordersRes.error.message}`);
    if (itemsRes.error) throw new Error(`Supabase order_items error: ${itemsRes.error.message}`);

    // 2. Aggregate order_items by order_id
    const itemsByOrder: Record<number, {
      total_units: number; line_items: number; distinct_products: Set<number>;
      unit_prices: number[]; line_total_sum: number;
    }> = {};

    for (const item of itemsRes.data ?? []) {
      const oid = item.order_id;
      if (!itemsByOrder[oid]) {
        itemsByOrder[oid] = { total_units: 0, line_items: 0, distinct_products: new Set(), unit_prices: [], line_total_sum: 0 };
      }
      const agg = itemsByOrder[oid];
      agg.total_units += item.quantity ?? 0;
      agg.line_items += 1;
      if (item.product_id) agg.distinct_products.add(item.product_id);
      if (item.unit_price != null) agg.unit_prices.push(item.unit_price);
      agg.line_total_sum += item.line_total ?? 0;
    }

    // 3. Flatten into the shape the scoring function expects
    const orders = (ordersRes.data ?? []).map((o: any) => {
      const customer = Array.isArray(o.customers) ? (o.customers[0] ?? {}) : (o.customers ?? {});
      const shipment = Array.isArray(o.shipments) ? (o.shipments[0] ?? {}) : (o.shipments ?? {});
      const agg = itemsByOrder[o.order_id];
      return {
        order_id:           o.order_id,
        billing_zip:        o.billing_zip,
        shipping_zip:       o.shipping_zip,
        shipping_state:     o.shipping_state,
        payment_method:     o.payment_method,
        device_type:        o.device_type,
        ip_country:         o.ip_country,
        promo_used:         o.promo_used,
        order_subtotal:     o.order_subtotal,
        shipping_fee:       o.shipping_fee,
        tax_amount:         o.tax_amount,
        order_total:        o.order_total,
        risk_score:         o.risk_score,
        order_datetime:     o.order_datetime,
        gender:             customer.gender,
        city:               customer.city,
        customer_state:     customer.state,
        customer_segment:   customer.customer_segment,
        loyalty_tier:       customer.loyalty_tier,
        customer_is_active: customer.is_active,
        birthdate:          customer.birthdate,
        carrier:            shipment.carrier,
        shipping_method:    shipment.shipping_method,
        distance_band:      shipment.distance_band,
        promised_days:      shipment.promised_days,
        actual_days:        shipment.actual_days,
        late_delivery:      shipment.late_delivery,
        total_units:        agg?.total_units ?? 0,
        line_items:         agg?.line_items ?? 0,
        distinct_products:  agg ? agg.distinct_products.size : 0,
        avg_unit_price:     agg?.unit_prices.length ? agg.unit_prices.reduce((a, b) => a + b, 0) / agg.unit_prices.length : 0,
        line_total_sum:     agg?.line_total_sum ?? 0,
      };
    });

    // 4. Call the Python scoring service (Render) or local fallback
    const scoringUrl = process.env.SCORING_SERVICE_URL ?? "http://localhost:8001";

    const scoreRes = await fetch(`${scoringUrl}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders }),
    });

    if (!scoreRes.ok) {
      const text = await scoreRes.text();
      throw new Error(`Scoring function error ${scoreRes.status}: ${text}`);
    }

    const result = await scoreRes.json();

    if (result.error) throw new Error(result.error);

    // 5. Write predictions back to Supabase
    const { error: upsertError } = await supabase
      .from("order_predictions")
      .upsert(result.predictions, { onConflict: "order_id" });

    if (upsertError) throw new Error(`Supabase upsert error: ${upsertError.message}`);

    return NextResponse.json({
      status: "success",
      scored: result.scored,
      timestamp: result.timestamp,
      model_errors: result.model_errors ?? null,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
