import { supabase } from "@/lib/db";
import CustomerPicker from "./CustomerPicker";

interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
  customer_segment: string;
  loyalty_tier: string;
}

export default async function SelectCustomerPage() {
  const { data: customers } = await supabase
    .from("customers")
    .select("customer_id, full_name, email, customer_segment, loyalty_tier")
    .eq("is_active", 1)
    .order("full_name")
    .returns<Customer[]>();

  return (
    <div>
      <h1>Select Customer</h1>
      <p className="text-muted mb-1">
        Choose a customer to act as for this session.
      </p>
      <CustomerPicker customers={customers ?? []} />
    </div>
  );
}
