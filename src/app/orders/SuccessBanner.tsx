"use client";

import { useRouter } from "next/navigation";

export default function SuccessBanner({ orderId }: { orderId: string }) {
  const router = useRouter();

  function dismiss() {
    router.replace("/orders");
  }

  return (
    <div
      className="card mb-1"
      style={{ background: "#dcfce7", borderColor: "#16a34a" }}
    >
      <div className="flex-gap">
        <p style={{ flex: 1 }}>
          <strong>Order #{orderId} placed successfully!</strong>
        </p>
        <button onClick={dismiss} style={{ background: "transparent" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
