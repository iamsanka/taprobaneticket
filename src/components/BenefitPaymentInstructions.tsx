"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./benefitInstructions.css";

type CartItem = {
  typeId: number;
  quantity: number;
  price: number;
  categoryName: string;
  typeName: string;
  eventId: number;
};

type Customer = {
  name: string;
  email: string;
  phone: string;
};

type CreatedOrder = {
  orderId: number;
  orderNumber: string;
  total: number;
};

type PublicSettings = {
  whatsappNumber: string;
  whatsappDisplay: string;
  brandName: string;
};

// Fallbacks used only if the settings endpoint fails (network down, etc.)
const FALLBACK_SETTINGS: PublicSettings = {
  whatsappNumber: "358442363616",
  whatsappDisplay: "+358 442363616",
  brandName: "Taprobane Entertainment",
};

export function BenefitPaymentInstructions({
  brandName,
}: {
  brandName: "ePassi" | "Edenred";
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const didRun = useRef(false);

  // ---- Load public settings on mount ----
  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const res = await fetch("/api/public/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.settings) {
          setSettings({
            whatsappNumber:
              data.settings.whatsappNumber || FALLBACK_SETTINGS.whatsappNumber,
            whatsappDisplay:
              data.settings.whatsappDisplay ||
              FALLBACK_SETTINGS.whatsappDisplay,
            brandName: data.settings.brandName || FALLBACK_SETTINGS.brandName,
          });
        }
      } catch {
        // silently keep fallbacks
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Create benefit order on mount ----
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const cartRaw = localStorage.getItem("cart");
    const custRaw = localStorage.getItem("checkoutCustomer");

    if (!cartRaw || !custRaw) {
      setStatus("error");
      setErrorMsg("Your cart or customer details are missing. Please start over.");
      return;
    }

    const cartItems: CartItem[] = JSON.parse(cartRaw);
    const cust: Customer = JSON.parse(custRaw);
    setCart(cartItems);
    setCustomer(cust);

    const method = brandName.toLowerCase(); // "epassi" | "edenred"
    const cartHash = JSON.stringify(cartItems);

    // Idempotency key tied to the cart contents
    const keyStorage = `benefitKey:${method}`;
    let idempotencyKey: string;

    let stored: { key: string; cartHash: string } | null = null;
    try {
      const raw = localStorage.getItem(keyStorage);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }

    if (stored && stored.cartHash === cartHash) {
      idempotencyKey = stored.key;
    } else {
      idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(
        keyStorage,
        JSON.stringify({ key: idempotencyKey, cartHash })
      );
    }

    // Reuse cached order for the same cart
    const orderCacheKey = `benefitOrder:${method}`;
    const cachedOrderRaw = localStorage.getItem(orderCacheKey);
    if (cachedOrderRaw) {
      try {
        const parsed = JSON.parse(cachedOrderRaw);
        if (
          parsed.cartHash === cartHash &&
          parsed.idempotencyKey === idempotencyKey
        ) {
          setOrder({
            orderId: parsed.orderId,
            orderNumber: parsed.orderNumber,
            total: parsed.total,
          });
          setStatus("ready");
          return;
        }
      } catch {
        // ignore bad cache
      }
    }

    async function createOrder() {
      const res = await fetch("/api/checkout/benefit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: cust.name,
          customerEmail: cust.email,
          customerPhone: cust.phone,
          cartItems,
          method,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Could not create order");
        return;
      }

      localStorage.setItem(
        orderCacheKey,
        JSON.stringify({
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          total: data.total,
          cartHash,
          idempotencyKey,
        })
      );

      setOrder({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        total: data.total,
      });
      setStatus("ready");
    }

    createOrder();
  }, [brandName]);

  const total =
    order?.total ?? cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const lines = cart.map(
    (i) =>
      `• ${i.categoryName} — ${i.typeName} × ${i.quantity}: €${(
        (i.price * i.quantity) /
        100
      ).toFixed(2)}`
  );

  // Use settings-driven values instead of hardcoded constants
  const whatsappMessage = [
    `Hi ${settings.brandName}, I've paid for my tickets via ${brandName}.`,
    ``,
    order ? `Order number: ${order.orderNumber}` : "",
    ``,
    `Order details:`,
    ...lines,
    `Total: €${(total / 100).toFixed(2)}`,
    ``,
    customer ? `Name: ${customer.name}` : "",
    customer ? `Email: ${customer.email}` : "",
    customer ? `Phone: ${customer.phone}` : "",
    ``,
    `Payment confirmation screenshot is attached below.`,
  ]
    .filter((x) => x !== "")
    .join("\n");

  const whatsappUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
    whatsappMessage
  )}`;

  if (status === "loading") {
    return (
      <div className="bpi-page">
        <div className="bpi-card">
          <div className="bpi-loading">Preparing your order…</div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="bpi-page">
        <div className="bpi-card">
          <h1 className="bpi-title">Something went wrong</h1>
          <p className="bpi-subtitle">{errorMsg}</p>
          <button
            className="bpi-btn bpi-btn-primary"
            style={{ marginTop: 20 }}
            onClick={() => router.push("/cart")}
          >
            Back to Cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bpi-page">
      <div className="bpi-card">
        <button className="bpi-back" onClick={() => router.back()}>
          ← Back to Checkout
        </button>

        <div className="bpi-header">
          <div className="bpi-brand-mark">
            <span
              className={`bpi-brand-dot bpi-brand-${brandName.toLowerCase()}`}
            />
            <span className="bpi-brand-name">{brandName}</span>
          </div>
          <h1 className="bpi-title">Complete your payment</h1>
          <p className="bpi-subtitle">
            Follow the steps below to pay with {brandName}. Once we receive your
            confirmation, we'll email your tickets.
          </p>
        </div>

        {order && (
          <section className="bpi-section">
            <div className="bpi-order-badge">
              <span className="bpi-order-badge-label">Your order number</span>
              <span className="bpi-order-badge-value">{order.orderNumber}</span>
            </div>
          </section>
        )}

        <section className="bpi-section">
          <p className="bpi-section-title">Order Summary</p>
          <div className="bpi-summary">
            {cart.map((item) => (
              <div key={item.typeId} className="bpi-summary-row">
                <span>
                  {item.categoryName} — {item.typeName}{" "}
                  <span className="bpi-qty">× {item.quantity}</span>
                </span>
                <span>
                  €{((item.price * item.quantity) / 100).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="bpi-summary-total">
              <span>Total to pay</span>
              <span>€{(total / 100).toFixed(2)}</span>
            </div>
          </div>
        </section>

        <section className="bpi-section">
          <p className="bpi-section-title">How to pay with {brandName}</p>
          <ol className="bpi-steps">
            <li>
              Open the <strong>{brandName}</strong> app on your phone.
            </li>
            <li>
              Search for <strong>{settings.brandName}</strong> in the merchant
              list.
            </li>
            <li>
              Select the tickets you want and enter the total amount of{" "}
              <strong>€{(total / 100).toFixed(2)}</strong>.
            </li>
            <li>Complete the payment in the app.</li>
            <li>
              Take a <strong>screenshot of the payment confirmation</strong>.
            </li>
            <li>
              Send the screenshot to us on WhatsApp at{" "}
              <strong>{settings.whatsappDisplay}</strong>.
            </li>
          </ol>
        </section>

        <section className="bpi-section">
          <p className="bpi-section-title">Send us your confirmation</p>
          <a
            className="bpi-whatsapp-btn"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            Send confirmation on WhatsApp
          </a>
          <p className="bpi-whatsapp-number">{settings.whatsappDisplay}</p>
        </section>

        <section className="bpi-section bpi-next">
          <p className="bpi-section-title">What happens next?</p>
          <ul className="bpi-next-list">
            <li>We receive your WhatsApp screenshot and verify the payment.</li>
            <li>
              We email your tickets to{" "}
              <strong>{customer?.email ?? "your email"}</strong> within a few
              hours.
            </li>
            <li>Show the QR code at the entrance to be scanned.</li>
          </ul>
        </section>

        <p className="bpi-note">
          Please complete the WhatsApp step — we cannot issue tickets until we
          receive your payment confirmation.
        </p>
      </div>
    </div>
  );
}