"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./Cart.css";

type CartItem = {
  typeId: number;
  quantity: number;
  price: number;
  categoryName: string;
  typeName: string;
  eventId: number;
};

// Matches the default in app_settings. Only used for the display hint.
const VAT_RATE_OF_GROSS = 0.135;

export default function Cart() {
  const router = useRouter();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cart");
    if (stored) {
      try {
        setCartItems(JSON.parse(stored));
      } catch {
        // ignore bad cart
      }
    }
    setLoading(false);
  }, []);

  function persist(items: CartItem[]) {
    setCartItems(items);
    localStorage.setItem("cart", JSON.stringify(items));
  }

  function removeItem(typeId: number) {
    persist(cartItems.filter((item) => item.typeId !== typeId));
  }

  function updateQuantity(typeId: number, delta: number) {
    const updated = cartItems
      .map((item) =>
        item.typeId === typeId
          ? { ...item, quantity: item.quantity + delta }
          : item
      )
      .filter((item) => item.quantity > 0);
    persist(updated);
  }

  const { totalQuantity, totalPrice, vatAmount, netAmount } = useMemo(() => {
    const qty = cartItems.reduce((sum, i) => sum + i.quantity, 0);
    const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const vat = Math.round(total * VAT_RATE_OF_GROSS);
    return {
      totalQuantity: qty,
      totalPrice: total,
      vatAmount: vat,
      netAmount: total - vat,
    };
  }, [cartItems]);

  // ==================================================
  // Loading
  // ==================================================
  if (loading) {
    return (
      <div className="cart-page">
        <div className="cart-state">
          <div className="cart-state-spinner" />
          <p className="cart-state-text">Loading your cart…</p>
        </div>
      </div>
    );
  }

  // ==================================================
  // Empty
  // ==================================================
  if (cartItems.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-state">
          <div className="cart-state-icon">
            <CartIcon />
          </div>
          <p className="cart-state-title">Your cart is empty</p>
          <p className="cart-state-text">
            Browse our events and add tickets to get started.
          </p>
          <button
            className="cart-state-btn"
            onClick={() => router.push("/")}
          >
            Browse Events
            <ArrowRightIcon />
          </button>
        </div>
      </div>
    );
  }

  // ==================================================
  // Populated
  // ==================================================
  return (
    <div className="cart-page">
      {/* ---- Back ---- */}
      <button className="cart-back" onClick={() => router.back()}>
        <ArrowLeftIcon />
        Back to Event
      </button>

      {/* ---- Header ---- */}
      <header className="cart-header">
        <h1 className="cart-title">Your Cart</h1>
        <p className="cart-subtitle">
          {totalQuantity}{" "}
          {totalQuantity === 1 ? "ticket" : "tickets"} ready to checkout
        </p>
      </header>

      <div className="cart-layout">
        {/* ================================================== */}
        {/* Items list                                         */}
        {/* ================================================== */}
        <section className="cart-items-column">
          <div className="cart-items">
            {cartItems.map((item) => {
              const subtotal = item.price * item.quantity;
              return (
                <div key={item.typeId} className="cart-item">
                  <div className="cart-item-info">
                    <h3 className="cart-item-name">
                      <span className="cart-item-category">
                        {item.categoryName}
                      </span>
                      <span className="cart-item-dash">—</span>
                      <span className="cart-item-type">{item.typeName}</span>
                    </h3>
                    <p className="cart-item-unit">
                      €{(item.price / 100).toFixed(2)} per ticket
                    </p>
                  </div>

                  <div className="cart-item-controls">
                    <div className="cart-qty">
                      <button
                        type="button"
                        className="cart-qty-btn"
                        onClick={() => updateQuantity(item.typeId, -1)}
                        aria-label="Decrease quantity"
                      >
                        <MinusIcon />
                      </button>
                      <span className="cart-qty-value">{item.quantity}</span>
                      <button
                        type="button"
                        className="cart-qty-btn cart-qty-btn-plus"
                        onClick={() => updateQuantity(item.typeId, 1)}
                        aria-label="Increase quantity"
                      >
                        <PlusIcon />
                      </button>
                    </div>

                    <div className="cart-item-subtotal">
                      €{(subtotal / 100).toFixed(2)}
                    </div>

                    <button
                      type="button"
                      className="cart-remove"
                      onClick={() => removeItem(item.typeId)}
                      aria-label={`Remove ${item.categoryName} ${item.typeName}`}
                      title="Remove from cart"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================================================== */}
        {/* Order summary                                      */}
        {/* ================================================== */}
        <aside className="cart-summary-column">
          <div className="cart-summary-card">
            <h2 className="cart-summary-title">Order Summary</h2>

            <dl className="cart-summary-list">
              <div className="cart-summary-row">
                <dt>Subtotal</dt>
                <dd>€{(totalPrice / 100).toFixed(2)}</dd>
              </div>
              <div className="cart-summary-row cart-summary-row-hint">
                <dt>Includes VAT (13.5%)</dt>
                <dd>€{(vatAmount / 100).toFixed(2)}</dd>
              </div>
              <div className="cart-summary-row cart-summary-row-sub">
                <dt>Net amount</dt>
                <dd>€{(netAmount / 100).toFixed(2)}</dd>
              </div>
            </dl>

            <div className="cart-summary-divider" />

            <div className="cart-summary-total">
              <span>Total</span>
              <span>€{(totalPrice / 100).toFixed(2)}</span>
            </div>

            <button
              className="cart-checkout-btn"
              onClick={() => router.push("/checkout")}
            >
              Proceed to Checkout
              <ArrowRightIcon />
            </button>

            <p className="cart-summary-note">
              You'll be asked for contact details and payment method on the
              next step.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Sticky bar (mobile only, visible via CSS) ---- */}
      <div className="cart-sticky-bar">
        <div className="cart-sticky-info">
          <span className="cart-sticky-label">{totalQuantity} tickets</span>
          <span className="cart-sticky-total">
            €{(totalPrice / 100).toFixed(2)}
          </span>
        </div>
        <button
          className="cart-sticky-btn"
          onClick={() => router.push("/checkout")}
        >
          Checkout
          <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function ArrowLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}