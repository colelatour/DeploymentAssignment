import { redirect } from "next/navigation";
import { supabase } from "@/lib/db";
import { getCustomerId } from "@/lib/getCustomerId";
import OrderForm from "./OrderForm";

interface Product {
  product_id: number;
  product_name: string;
  price: number;
}

export default async function PlaceOrderPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }

  const { data: products } = await supabase
    .from("products")
    .select("product_id, product_name, price")
    .eq("is_active", 1)
    .order("product_name")
    .returns<Product[]>();

  return (
    <div>
      <h1>Place Order</h1>
      <OrderForm products={products ?? []} customerId={customerId} />
    </div>
  );
}
