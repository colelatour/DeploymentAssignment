"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Product {
  product_id: number;
  product_name: string;
  price: number;
}

interface LineItem {
  product: Product;
  quantity: number;
}

export default function OrderForm({
  products,
  customerId,
}: {
  products: Product[];
  customerId: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LineItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");

  /* ── Cart helpers ────────────────────────────────────── */

  function addItem() {
    setValidation("");

    if (!selectedId) {
      setValidation("Please select a product.");
      return;
    }

    const prod = products.find((p) => p.product_id === Number(selectedId));
    if (!prod) {
      setValidation("Selected product not found.");
      return;
    }

    if (!Number.isInteger(qty) || qty < 1) {
      setValidation("Quantity must be at least 1.");
      return;
    }

    if (qty > 99) {
      setValidation("Quantity cannot exceed 99.");
      return;
    }

    setItems((prev) => {
      const existing = prev.find(
        (i) => i.product.product_id === prod.product_id
      );
      if (existing) {
        return prev.map((i) =>
          i.product.product_id === prod.product_id
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [...prev, { product: prod, quantity: qty }];
    });
    setSelectedId("");
    setQty(1);
  }

  function removeItem(productId: number) {
    setItems((prev) =>
      prev.filter((i) => i.product.product_id !== productId)
    );
  }

  const totalValue = items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );

  /* ── Submit ──────────────────────────────────────────── */

  async function handleSubmit() {
    setError("");
    setValidation("");

    if (items.length === 0) {
      setValidation("Add at least one product before placing an order.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          items: items.map((i) => ({
            product_id: i.product.product_id,
            quantity: i.quantity,
            unit_price: i.product.price,
          })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push(`/orders?success=${data.order_id}`);
        router.refresh();
      } else {
        setError(data.error ?? "Something went wrong");
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── UI ──────────────────────────────────────────────── */

  return (
    <div>
      {/* ── Product picker ─────────────────────────────── */}
      <div className="card">
        <h2>Add Line Items</h2>
        <div className="flex-gap">
          <div style={{ flex: 2 }}>
            <label htmlFor="product">Product</label>
            <select
              id="product"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setValidation("");
              }}
            >
              <option value="">-- Select product --</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_name} — ${p.price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 0.5 }}>
            <label htmlFor="qty">Qty</label>
            <input
              id="qty"
              type="number"
              min={1}
              max={99}
              value={qty}
              onChange={(e) => {
                setQty(Math.max(1, Number(e.target.value)));
                setValidation("");
              }}
            />
          </div>
          <div style={{ paddingTop: "1.4rem" }}>
            <button className="primary" onClick={addItem}>
              Add
            </button>
          </div>
        </div>

        {validation && (
          <p style={{ color: "var(--warning)", fontSize: "0.85rem" }}>
            {validation}
          </p>
        )}
      </div>

      {/* ── Line items table ───────────────────────────── */}
      {items.length > 0 && (
        <div className="card">
          <h2>Line Items ({items.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Line Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.product.product_id}>
                  <td>{i.product.product_name}</td>
                  <td>${i.product.price.toFixed(2)}</td>
                  <td>{i.quantity}</td>
                  <td>${(i.product.price * i.quantity).toFixed(2)}</td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => removeItem(i.product.product_id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-1">
            <strong>Order Total: ${totalValue.toFixed(2)}</strong>
          </p>

          <button
            className="primary mt-1"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Placing order..." : "Place Order"}
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)" }}>
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}
    </div>
  );
}
