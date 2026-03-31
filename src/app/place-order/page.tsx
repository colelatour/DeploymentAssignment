import { redirect } from "next/navigation";
import { queryAll } from "@/lib/db";
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

  const products = queryAll<Product>(
    "SELECT product_id, product_name, price FROM products WHERE is_active = 1 ORDER BY product_name"
  );

  return (
    <div>
      <h1>Place Order</h1>
      <OrderForm products={products} customerId={customerId} />
    </div>
  );
}
