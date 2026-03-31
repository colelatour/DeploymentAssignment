"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
  customer_segment: string;
  loyalty_tier: string;
}

export default function CustomerPicker({
  customers,
}: {
  customers: Customer[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [search, customers]);

  const cust = customers.find((c) => c.customer_id === selected);

  function handleSelect(id: number) {
    setSelected(id);
  }

  function handleGo() {
    if (selected) {
      document.cookie = `customerId=${selected};path=/;max-age=86400`;
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div>
      <div className="card">
        <label htmlFor="search">Search by name or email</label>
        <input
          id="search"
          type="text"
          placeholder="Type to filter customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: "6px",
          }}
        >
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Email</th>
                <th>Segment</th>
                <th>Loyalty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted text-center">
                    No customers match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.customer_id}
                    onClick={() => handleSelect(c.customer_id)}
                    style={{
                      cursor: "pointer",
                      background:
                        selected === c.customer_id ? "#dbeafe" : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="radio"
                        name="customer"
                        checked={selected === c.customer_id}
                        onChange={() => handleSelect(c.customer_id)}
                      />
                    </td>
                    <td>
                      <strong>{c.full_name}</strong>
                    </td>
                    <td>{c.email}</td>
                    <td>
                      <span className="badge blue">{c.customer_segment}</span>
                    </td>
                    <td>
                      <span className="badge green">{c.loyalty_tier}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-muted mt-1" style={{ fontSize: "0.85rem" }}>
          Showing {filtered.length} of {customers.length} customers
        </p>
      </div>

      {cust && (
        <div className="card">
          <h2>Selected: {cust.full_name}</h2>
          <p>
            {cust.email} &middot; Segment:{" "}
            <strong>{cust.customer_segment}</strong> &middot; Loyalty:{" "}
            <strong>{cust.loyalty_tier}</strong>
          </p>
          <button className="primary mt-1" onClick={handleGo}>
            Continue as {cust.full_name}
          </button>
        </div>
      )}
    </div>
  );
}
