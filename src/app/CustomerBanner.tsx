import { cookies } from "next/headers";
import { supabase } from "@/lib/db";
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

  const { data: customer, error } = await supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .eq("customer_id", Number(val))
    .single<Customer>();

  if (error || !customer) {
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
