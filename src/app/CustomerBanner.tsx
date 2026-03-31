import { cookies } from "next/headers";
import { queryOne } from "@/lib/db";
import Link from "next/link";

interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
}

export default async function CustomerBanner() {
  const store = await cookies();
  const val = store.get("customerId")?.value;

  if (!val) {
    return (
      <div className="customer-banner no-customer">
        No customer selected &mdash;{" "}
        <Link href="/select-customer">pick one</Link>
      </div>
    );
  }

  let customer: Customer | undefined;
  try {
    customer = queryOne<Customer>(
      "SELECT customer_id, full_name, email FROM customers WHERE customer_id = ?",
      [Number(val)]
    );
  } catch {
    return (
      <div className="customer-banner no-customer">
        Database error &mdash; check that shop.db exists
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="customer-banner no-customer">
        Invalid customer &mdash;{" "}
        <Link href="/select-customer">select again</Link>
      </div>
    );
  }

  return (
    <div className="customer-banner active-customer">
      Acting as <strong>{customer.full_name}</strong> ({customer.email})
      &nbsp;&middot;&nbsp;
      <Link href="/select-customer">Switch</Link>
    </div>
  );
}
