"use client";

import { useEffect } from "react";

export default function RedirectCleaner() {
  useEffect(() => {
    // Clean redirect — remove Stripe query params
    window.location.replace("/checkout/success");
  }, []);

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>Finalizing your payment…</h2>
    </div>
  );
}
