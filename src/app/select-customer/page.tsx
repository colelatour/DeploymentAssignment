import { queryAll } from "@/lib/db";
import CustomerPicker from "./CustomerPicker";

interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
  customer_segment: string;
  loyalty_tier: string;
}

export default function SelectCustomerPage() {
  const customers = queryAll<Customer>(
    "SELECT customer_id, full_name, email, customer_segment, loyalty_tier FROM customers WHERE is_active = 1 ORDER BY full_name"
  );

  return (
    <div>
      <h1>Select Customer</h1>
      <p className="text-muted mb-1">
        Choose a customer to act as for this session.
      </p>
      <CustomerPicker customers={customers} />
    </div>
  );
}
