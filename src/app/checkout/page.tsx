"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import SeatPicker, {
  type SeatSelection,
} from "@/components/SeatPicker";
import "./checkout.css";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type CartItem = {
  typeId: number;
  categoryId: number; // ⭐ NEW — required for seat-map lookup
  quantity: number;
  price: number;
  categoryName: string;
  typeName: string;
  eventId: number;
};

type PaymentMethod = "card" | "epassi" | "edenred";

// ⭐ Applied discount shape (subset of the validate API response)
type AppliedDiscount = {
  code: string;
  percentage: number;
};

// ⭐ NEW — one entry per seated category detected in the cart
type SeatedCategory = {
  categoryId: number;
  categoryName: string;
  mapId: number;
  mapName: string;
  expectedCount: number; // sum of quantities in the cart for this category
};

// Only used for the summary hint — the invoice uses the authoritative value
// from app_settings at generation time.
const VAT_RATE_OF_GROSS = 0.135;

function hasPaymentIntent(
  result: any
): result is { paymentIntent: { id: string } } {
  return (
    result &&
    typeof result === "object" &&
    "paymentIntent" in result &&
    result.paymentIntent &&
    typeof result.paymentIntent.id === "string"
  );
}

// ======================================================
// Stripe payment stage
// ======================================================

function StripePaymentForm({
  clientSecret,
  onBack,
}: {
  clientSecret: string;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      alert(result.error.message);
      setSubmitting(false);
      return;
    }

    if (hasPaymentIntent(result)) {
      localStorage.setItem("lastPaymentIntent", result.paymentIntent.id);
    }

    window.location.href = "/checkout/success";
  }

  return (
    <div className="checkout-card">
      <div className="checkout-card-header">
        <h2 className="checkout-card-title">Complete your payment</h2>
        <p className="checkout-card-subtitle">
          Enter your card details to confirm the purchase
        </p>
      </div>

      <form onSubmit={handlePayment} className="checkout-stripe-form">
        <PaymentElement />

        <button
          className="checkout-primary-btn"
          type="submit"
          disabled={submitting || !stripe || !elements}
        >
          {submitting ? "Processing…" : "Pay Now"}
          {!submitting && <ArrowRightIcon />}
        </button>

        <button
          type="button"
          className="checkout-secondary-btn"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeftIcon />
          Change payment method
        </button>
      </form>
    </div>
  );
}

// ======================================================
// Page
// ======================================================

export default function CheckoutPage() {
  const router = useRouter();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [clientSecret, setClientSecret] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});

  // ⭐ Discount state
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] =
    useState<AppliedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);

  // ⭐ NEW — seat-selection state
  const [seatedCategories, setSeatedCategories] = useState<
    SeatedCategory[] | null
  >(null);
  const [checkingSeats, setCheckingSeats] = useState(true);
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  const [seatSelection, setSeatSelection] = useState<SeatSelection | null>(
    null
  );

  useEffect(() => {
    const stored = localStorage.getItem("cart");
    if (stored) {
      try {
        setCartItems(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
    setLoading(false);
  }, []);

  // ⭐ NEW — after cart loads, figure out which categories need seats
  useEffect(() => {
    if (cartItems.length === 0) {
      setCheckingSeats(false);
      setSeatedCategories([]);
      return;
    }

    const eventId = cartItems[0].eventId;

    // Group quantities by categoryId
    const byCategory = new Map<
      number,
      { categoryId: number; categoryName: string; quantity: number }
    >();
    for (const item of cartItems) {
      if (typeof item.categoryId !== "number") {
        // Cart item is missing categoryId — patch your cart-add code.
        console.warn(
          "[checkout] CartItem missing categoryId. Seat selection disabled."
        );
        continue;
      }
      const entry = byCategory.get(item.categoryId) ?? {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantity: 0,
      };
      entry.quantity += item.quantity;
      byCategory.set(item.categoryId, entry);
    }

    if (byCategory.size === 0) {
      setCheckingSeats(false);
      setSeatedCategories([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setCheckingSeats(true);
      try {
        const results = await Promise.all(
          Array.from(byCategory.values()).map(async (cat) => {
            try {
              const res = await fetch(
                `/api/public/seats/availability?eventId=${eventId}&categoryId=${cat.categoryId}`,
                { cache: "no-store" }
              );
              if (!res.ok) return null;
              const data = await res.json();
              if (!data.hasSeating) return null;
              return {
                categoryId: cat.categoryId,
                categoryName: cat.categoryName,
                mapId: data.map.id as number,
                mapName: data.map.name as string,
                expectedCount: cat.quantity,
              } satisfies SeatedCategory;
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        setSeatedCategories(
          results.filter((r) => r !== null) as SeatedCategory[]
        );
      } catch (err) {
        console.error("Seat check error:", err);
        if (!cancelled) setSeatedCategories([]);
      } finally {
        if (!cancelled) setCheckingSeats(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cartItems]);

  // ⭐ Totals — always derived from cart + appliedDiscount
  const { totalQuantity, subtotal, discountAmount, finalTotal, vatAmount } =
    useMemo(() => {
      const qty = cartItems.reduce((sum, i) => sum + i.quantity, 0);
      const sub = cartItems.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );

      // Mirror the server: floor (never round up) to avoid over-discounting
      const disc = appliedDiscount
        ? Math.floor((sub * appliedDiscount.percentage) / 100)
        : 0;

      const final = sub - disc;

      return {
        totalQuantity: qty,
        subtotal: sub,
        discountAmount: disc,
        finalTotal: final,
        // VAT hint reflects the FINAL (post-discount) amount
        vatAmount: Math.round(final * VAT_RATE_OF_GROSS),
      };
    }, [cartItems, appliedDiscount]);

  // ⭐ NEW — seat-derived state
  const singleSeatedCategory =
    seatedCategories && seatedCategories.length === 1
      ? seatedCategories[0]
      : null;
  const multipleSeatedCategories =
    seatedCategories !== null && seatedCategories.length > 1;

  const seatsSatisfied =
    !singleSeatedCategory ||
    (seatSelection !== null &&
      seatSelection.seatIds.length === singleSeatedCategory.expectedCount);

  function handleSeatSelectionChange(sel: SeatSelection | null) {
    setSeatSelection(sel);
  }

  function handleSeatConfirm(sel: SeatSelection) {
    setSeatSelection(sel);
    setSeatPickerOpen(false);
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Please enter your name";
    if (!email.trim()) {
      next.email = "Please enter your email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Please enter a valid email";
    }
    if (!phone.trim()) next.phone = "Please enter a contact number";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ⭐ Apply a discount code (validate only — the real claim happens
  //   inside /api/checkout so the code is never consumed by a browser
  //   that abandons the flow before pressing "Continue").
  async function handleApplyDiscount() {
    const code = discountInput.trim().toUpperCase();
    if (!code) {
      setDiscountError("Enter a code");
      return;
    }

    const eventId = cartItems[0]?.eventId;
    if (!eventId) {
      setDiscountError("Cart is empty");
      return;
    }

    setDiscountLoading(true);
    setDiscountError(null);

    try {
      const res = await fetch("/api/public/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, eventId }),
      });

      const data = await res.json();

      if (!data.valid) {
        setDiscountError(data.message || "Invalid discount code");
        return;
      }

      setAppliedDiscount({
        code: data.code,
        percentage: data.percentage,
      });
      setDiscountInput("");
    } catch (err) {
      console.error(err);
      setDiscountError("Network error — please try again");
    } finally {
      setDiscountLoading(false);
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError(null);
  }

  async function handleContinue() {
    if (!validate()) return;

    // ⭐ Seat gate
    if (multipleSeatedCategories) {
      alert(
        "This order contains more than one seated category.\n\n" +
          "Please place separate orders for each seated category."
      );
      return;
    }
    if (singleSeatedCategory && !seatsSatisfied) {
      // Open the picker so the customer can finish selecting
      setSeatPickerOpen(true);
      return;
    }

    localStorage.setItem(
      "checkoutCustomer",
      JSON.stringify({ name, email, phone })
    );

    // ⭐ Persist the code so benefit-flow pages can pick it up
    if (appliedDiscount) {
      localStorage.setItem(
        "checkoutDiscountCode",
        appliedDiscount.code
      );
    } else {
      localStorage.removeItem("checkoutDiscountCode");
    }

    // ⭐ Persist seat selection for benefit-flow pages
    if (seatSelection) {
      localStorage.setItem(
        "checkoutSeatSelection",
        JSON.stringify(seatSelection)
      );
    } else {
      localStorage.removeItem("checkoutSeatSelection");
    }

    if (paymentMethod === "card") {
      await createPaymentIntent();
    } else if (paymentMethod === "epassi") {
      router.push("/checkout/epassi");
    } else if (paymentMethod === "edenred") {
      router.push("/checkout/edenred");
    }
  }

  async function createPaymentIntent() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          cartItems,
          // ⭐ Optional — server re-validates and claims the usage slot
          discountCode: appliedDiscount?.code ?? null,
          // ⭐ NEW — seat hold
          seatToken: seatSelection?.token ?? null,
          seatIds: seatSelection?.seatIds ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If the server rejects because seats were taken, clear the
        // local selection so the customer re-picks.
        if (
          data.code === "SEAT_UNAVAILABLE" ||
          data.code === "SEAT_EXPIRED"
        ) {
          setSeatSelection(null);
          setSeatPickerOpen(true);
        }
        alert(data.error || "Checkout failed");
        return;
      }

      setClientSecret(data.clientSecret);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // ==================================================
  // Loading
  // ==================================================
  if (loading || checkingSeats) {
    return (
      <div className="checkout-page">
        <div className="checkout-state">
          <div className="checkout-state-spinner" />
          <p className="checkout-state-text">Loading checkout…</p>
        </div>
      </div>
    );
  }

  // ==================================================
  // Empty cart
  // ==================================================
  if (cartItems.length === 0) {
    return (
      <div className="checkout-page">
        <div className="checkout-state">
          <div className="checkout-state-icon">
            <CartIcon />
          </div>
          <p className="checkout-state-title">Your cart is empty</p>
          <p className="checkout-state-text">
            Add tickets from an event to proceed to checkout.
          </p>
          <button
            className="checkout-primary-btn"
            style={{ width: "auto", padding: "12px 24px" }}
            onClick={() => router.push("/")}
          >
            Browse Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      {/* ---- Back ---- */}
      <button
        className="checkout-back"
        onClick={() => router.back()}
        disabled={submitting}
      >
        <ArrowLeftIcon />
        Back to Cart
      </button>

      {/* ---- Progress steps ---- */}
      <div className="checkout-steps" aria-label="Checkout progress">
        <Step label="Cart" state="done" />
        <span className="checkout-step-line" />
        <Step label="Checkout" state="current" />
        <span className="checkout-step-line" />
        <Step label="Confirmation" state="upcoming" />
      </div>

      {/* ---- Header ---- */}
      <header className="checkout-header">
        <h1 className="checkout-title">Checkout</h1>
        <p className="checkout-subtitle">
          Enter your details and choose how you'd like to pay
        </p>
      </header>

      <div className="checkout-layout">
        {/* ============================================ */}
        {/* Left column                                   */}
        {/* ============================================ */}
        <div className="checkout-main">
          {!clientSecret ? (
            <>
              {/* ---- Customer Details ---- */}
              <section className="checkout-card">
                <div className="checkout-card-header">
                  <h2 className="checkout-card-title">Customer Details</h2>
                  <p className="checkout-card-subtitle">
                    We'll send your tickets and invoice to this email
                  </p>
                </div>

                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="co-name">
                    Full name
                  </label>
                  <input
                    id="co-name"
                    className={`checkout-input ${
                      errors.name ? "error" : ""
                    }`}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                  {errors.name && (
                    <span className="checkout-error">{errors.name}</span>
                  )}
                </div>

                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="co-email">
                    Email address
                  </label>
                  <input
                    id="co-email"
                    type="email"
                    className={`checkout-input ${
                      errors.email ? "error" : ""
                    }`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email)
                        setErrors({ ...errors, email: undefined });
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {errors.email && (
                    <span className="checkout-error">{errors.email}</span>
                  )}
                </div>

                <div className="checkout-field">
                  <label className="checkout-label" htmlFor="co-phone">
                    Contact number
                  </label>
                  <input
                    id="co-phone"
                    type="tel"
                    className={`checkout-input ${
                      errors.phone ? "error" : ""
                    }`}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors({ ...errors, phone: undefined });
                    }}
                    placeholder="+358 40 123 4567"
                    autoComplete="tel"
                  />
                  {errors.phone && (
                    <span className="checkout-error">{errors.phone}</span>
                  )}
                </div>
              </section>

              {/* ⭐ NEW — Seats card (only if a seated category is in cart) */}
              {singleSeatedCategory && (
                <section className="checkout-card">
                  <div className="checkout-card-header">
                    <h2 className="checkout-card-title">
                      Seats · {singleSeatedCategory.categoryName}
                    </h2>
                    <p className="checkout-card-subtitle">
                      Pick {singleSeatedCategory.expectedCount}{" "}
                      {singleSeatedCategory.expectedCount === 1
                        ? "seat"
                        : "seats"}{" "}
                      from {singleSeatedCategory.mapName}
                    </p>
                  </div>

                  {seatSelection && seatsSatisfied ? (
                    <div className="checkout-seats-applied">
                      <div className="checkout-seats-list">
                        {seatSelection.seats.map((s) => (
                          <span key={s.id} className="checkout-seat-chip">
                            {s.label}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="checkout-seats-change"
                        onClick={() => setSeatPickerOpen(true)}
                      >
                        Change seats
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="checkout-primary-btn"
                      onClick={() => setSeatPickerOpen(true)}
                    >
                      Select seats
                      <ArrowRightIcon />
                    </button>
                  )}
                </section>
              )}

              {multipleSeatedCategories && (
                <div className="checkout-seats-error">
                  ⚠️ This order contains more than one seated category.
                  Please place separate orders for each seated category.
                </div>
              )}

              {/* ---- Payment Method ---- */}
              <section className="checkout-card">
                <div className="checkout-card-header">
                  <h2 className="checkout-card-title">Payment Method</h2>
                  <p className="checkout-card-subtitle">
                    Choose how you'd like to pay for your tickets
                  </p>
                </div>

                <div className="payment-methods">
                  <PaymentMethodCard
                    value="card"
                    current={paymentMethod}
                    onChange={setPaymentMethod}
                    title="Debit / Credit Card"
                    subtitle="Visa · Mastercard · Apple Pay · Google Pay"
                    badge="card"
                    tag="Instant"
                  />
                  <PaymentMethodCard
                    value="epassi"
                    current={paymentMethod}
                    onChange={setPaymentMethod}
                    title="ePassi"
                    subtitle="Pay with your ePassi benefit balance"
                    badge="epassi"
                  />
                  <PaymentMethodCard
                    value="edenred"
                    current={paymentMethod}
                    onChange={setPaymentMethod}
                    title="Edenred"
                    subtitle="Pay with your Edenred benefit balance"
                    badge="edenred"
                  />
                </div>

                {paymentMethod === "card" && (
                  <div className="checkout-hint">
                    <InfoIcon />
                    <span>
                      You'll be asked to enter your card details on the next
                      step. Your tickets are issued instantly.
                    </span>
                  </div>
                )}
                {paymentMethod === "epassi" && (
                  <div className="checkout-hint checkout-hint-info">
                    <InfoIcon />
                    <span>
                      You'll be shown step-by-step instructions to pay with
                      ePassi, then send us your payment confirmation on
                      WhatsApp.
                    </span>
                  </div>
                )}
                {paymentMethod === "edenred" && (
                  <div className="checkout-hint checkout-hint-info">
                    <InfoIcon />
                    <span>
                      You'll be shown step-by-step instructions to pay with
                      Edenred, then send us your payment confirmation on
                      WhatsApp.
                    </span>
                  </div>
                )}

                <button
                  className="checkout-primary-btn"
                  onClick={handleContinue}
                  disabled={submitting || multipleSeatedCategories}
                >
                  {submitting
                    ? "Please wait…"
                    : singleSeatedCategory && !seatsSatisfied
                    ? "Select seats to continue"
                    : paymentMethod === "card"
                    ? "Continue to Payment"
                    : paymentMethod === "epassi"
                    ? "Continue with ePassi"
                    : "Continue with Edenred"}
                  {!submitting && <ArrowRightIcon />}
                </button>
              </section>
            </>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <StripePaymentForm
                clientSecret={clientSecret}
                onBack={() => setClientSecret("")}
              />
            </Elements>
          )}
        </div>

        {/* ============================================ */}
        {/* Right column — summary                        */}
        {/* ============================================ */}
        <aside className="checkout-summary-column">
          <div className="checkout-summary-card">
            <h2 className="checkout-summary-title">Order Summary</h2>

            <div className="checkout-summary-items">
              {cartItems.map((item) => (
                <div key={item.typeId} className="checkout-summary-item">
                  <div className="checkout-summary-item-info">
                    <span className="checkout-summary-item-name">
                      {item.categoryName} — {item.typeName}
                    </span>
                    <span className="checkout-summary-item-qty">
                      × {item.quantity}
                    </span>
                  </div>
                  <span className="checkout-summary-item-price">
                    €{((item.price * item.quantity) / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* ⭐ NEW — selected seats */}
            {seatSelection && seatSelection.seats.length > 0 && (
              <>
                <div className="checkout-summary-divider" />
                <div className="checkout-summary-seats">
                  <span className="checkout-summary-seats-label">
                    Your seats
                  </span>
                  <div className="checkout-summary-seats-list">
                    {seatSelection.seats.map((s) => (
                      <span key={s.id} className="checkout-seat-chip-sm">
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="checkout-summary-divider" />

            <dl className="checkout-summary-list">
              <div className="checkout-summary-row">
                <dt>Subtotal</dt>
                <dd>€{(subtotal / 100).toFixed(2)}</dd>
              </div>

              {/* ⭐ Discount row — only when a code is applied */}
              {appliedDiscount && (
                <div className="checkout-summary-row checkout-summary-row-discount">
                  <dt>
                    <span className="checkout-summary-discount-code">
                      {appliedDiscount.code}
                    </span>
                    <span className="checkout-summary-discount-pct">
                      −{appliedDiscount.percentage}%
                    </span>
                    {!clientSecret && (
                      <button
                        type="button"
                        className="checkout-summary-discount-remove"
                        onClick={handleRemoveDiscount}
                        aria-label="Remove discount code"
                        title="Remove discount"
                      >
                        ×
                      </button>
                    )}
                  </dt>
                  <dd>−€{(discountAmount / 100).toFixed(2)}</dd>
                </div>
              )}

              <div className="checkout-summary-row checkout-summary-row-hint">
                <dt>Includes VAT (13.5%)</dt>
                <dd>€{(vatAmount / 100).toFixed(2)}</dd>
              </div>
            </dl>

            {/* ⭐ Discount input — hidden once a code is applied and
                hidden entirely after the PaymentIntent is created */}
            {!clientSecret && !appliedDiscount && (
              <>
                <div className="checkout-summary-divider" />
                <div className="checkout-discount">
                  <label
                    className="checkout-discount-label"
                    htmlFor="co-discount"
                  >
                    Discount code
                  </label>
                  <div className="checkout-discount-input-group">
                    <input
                      id="co-discount"
                      type="text"
                      className="checkout-discount-input"
                      value={discountInput}
                      onChange={(e) => {
                        setDiscountInput(e.target.value.toUpperCase());
                        if (discountError) setDiscountError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleApplyDiscount();
                        }
                      }}
                      placeholder="Enter code"
                      maxLength={20}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={discountLoading}
                    />
                    <button
                      type="button"
                      className="checkout-discount-apply"
                      onClick={handleApplyDiscount}
                      disabled={
                        discountLoading || !discountInput.trim()
                      }
                    >
                      {discountLoading ? "…" : "Apply"}
                    </button>
                  </div>
                  {discountError && (
                    <div className="checkout-discount-error">
                      {discountError}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-total">
              <span>Total</span>
              <span>€{(finalTotal / 100).toFixed(2)}</span>
            </div>

            <div className="checkout-summary-meta">
              <div className="checkout-summary-meta-row">
                <span className="checkout-summary-meta-count">
                  {totalQuantity}{" "}
                  {totalQuantity === 1 ? "ticket" : "tickets"}
                </span>
                <span className="checkout-summary-meta-delivery">
                  <MailIcon />
                  Delivered by email
                </span>
              </div>
            </div>
          </div>

          <div className="checkout-trust">
            <ShieldIcon />
            <span>
              Secure checkout — your payment details are encrypted and never
              stored on our servers.
            </span>
          </div>
        </aside>
      </div>

      {/* ⭐ NEW — Seat picker modal */}
      {seatPickerOpen && singleSeatedCategory && (
        <SeatPicker
          eventId={cartItems[0].eventId}
          categoryId={singleSeatedCategory.categoryId}
          categoryName={singleSeatedCategory.categoryName}
          expectedCount={singleSeatedCategory.expectedCount}
          resume={seatSelection}
          onChange={handleSeatSelectionChange}
          onConfirm={handleSeatConfirm}
          onClose={() => setSeatPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ======================================================
// Payment method card
// ======================================================

function PaymentMethodCard({
  value,
  current,
  onChange,
  title,
  subtitle,
  badge,
  tag,
}: {
  value: PaymentMethod;
  current: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  title: string;
  subtitle: string;
  badge: "card" | "epassi" | "edenred";
  tag?: string;
}) {
  const isSelected = current === value;

  return (
    <button
      type="button"
      className={`payment-method-card ${isSelected ? "selected" : ""}`}
      onClick={() => onChange(value)}
      aria-pressed={isSelected}
    >
      <div className={`payment-method-radio ${isSelected ? "on" : ""}`}>
        {isSelected && <span className="payment-method-radio-dot" />}
      </div>

      <div className={`payment-method-badge payment-method-badge-${badge}`}>
        {badge === "card" && (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        )}
        {badge === "epassi" && (
          <span className="payment-method-badge-letter">e</span>
        )}
        {badge === "edenred" && (
          <span className="payment-method-badge-letter">E</span>
        )}
      </div>

      <div className="payment-method-text">
        <div className="payment-method-title-row">
          <span className="payment-method-title">{title}</span>
          {tag && <span className="payment-method-tag">{tag}</span>}
        </div>
        <div className="payment-method-subtitle">{subtitle}</div>
      </div>
    </button>
  );
}

// ======================================================
// Steps
// ======================================================

function Step({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "upcoming";
}) {
  return (
    <div className={`checkout-step checkout-step-${state}`}>
      <span className="checkout-step-dot">
        {state === "done" && <CheckIcon />}
      </span>
      <span className="checkout-step-label">{label}</span>
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

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function InfoIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ShieldIcon() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="22,6 12,13 2,6" />
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