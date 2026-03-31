import { cookies } from "next/headers";

export async function getCustomerId(): Promise<number | null> {
  const store = await cookies();
  const val = store.get("customerId")?.value;
  return val ? Number(val) : null;
}
