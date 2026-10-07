"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "../Orders.css";
import "./Details.css";

type OrderData = {
  id: number;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;

  // Amounts
  totalPrice: number;        // final (post-discount) total, incl. VAT
  subtotal: number;          // ⭐ pre-discount total, incl. VAT
  discountCode: string | null; // ⭐
  discountAmount: number;    // ⭐ pre-discount minus post-discount

  paidAt: string | null;
  ticketEmailSentAt: string | null;
  updatedAt: string;
};

type EventData = {
  id: number;
  title: string;
  eventTime: string;
  location: string;
};

type TicketRow = {
  id: number;
  ticketNumber: string;
  qrCodeData: string;
  isScanned: boolean;
  scannedAt: string | null;
  categoryName: string | null;
  typeName: string | null;
};

type ApiResponse = {
  order: OrderData;
  event: EventData | null;
  tickets: TicketRow[];
  paymentMethod: "card" | "epassi" | "edenred";
  vatAmount: number;
  netAmount: number;
  vatRatePercent: number; // ⭐ NEW — dynamic, no more hardcoded 13.5
};

// Orders in these statuses can be cancelled (unpaid only)
const CANCELLABLE_STATUSES = ["pending_benefit", "pending"];

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    async function load() {
      try {
        const res = await fetch(`/api/super-admin/orders/${orderId}`, {
          credentials: "include",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error || `Failed to load order (${res.status})`);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [orderId]);

  async function handleResendEmail() {
    if (!data) return;

    const ok = window.confirm(
      `Resend the ticket email to ${data.order.customerEmail}?\n\n` +
        `The customer will receive a new email with the same PDFs and invoice.`
    );
    if (!ok) return;

    setResending(true);
    try {
      const res = await fetch(
        `/api/super-admin/orders/${data.order.id}/resend-email`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to resend email");
        return;
      }

      alert("Email resent successfully.");
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setResending(false);
    }
  }

  async function handleCancelOrder() {
    if (!data) return;

    const ok = window.confirm(
      `Cancel order ${data.order.orderNumber}?\n\n` +
        `Customer: ${data.order.customerName} (${data.order.customerEmail})\n` +
        `Total: €${(data.order.totalPrice / 100).toFixed(2)}\n\n` +
        `This cannot be undone. The order will be marked as CANCELLED and no email will be sent.`
    );
    if (!ok) return;

    setCancelling(true);
    try {
      const res = await fetch(
        `/api/super-admin/orders/${data.order.id}/cancel`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to cancel order");
        return;
      }

      // Update the local state so the UI reflects the new status
      setData((prev) =>
        prev
          ? {
              ...prev,
              order: { ...prev.order, status: "cancelled" },
            }
          : prev
      );

      alert(`Order ${data.order.orderNumber} has been cancelled.`);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="sa-orders">
        <div className="sa-orders-empty">Loading order…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sa-orders">
        <div className="sa-orders-error">{error || "Order not found"}</div>
        <div style={{ marginTop: 20 }}>
          <Link href="/super-admin/orders" className="sa-back-link">
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const {
    order,
    event,
    tickets,
    paymentMethod,
    vatAmount,
    netAmount,
    vatRatePercent,
  } = data;

  const scannedCount = tickets.filter((t) => t.isScanned).length;
  const canCancel = CANCELLABLE_STATUSES.includes(order.status) && !order.paidAt;
  const canResend = order.status === "paid";

  // ⭐ Discount handling
  const hasDiscount = order.discountAmount > 0 && !!order.discountCode;

  // Pre-discount VAT split (mirrors the API's `gross * rate` model)
  const vatRate = vatRatePercent ?? 13.5;
  const vatDecimal = vatRate / 100;
  const preVat = hasDiscount ? Math.round(order.subtotal * vatDecimal) : 0;
  const preNet = hasDiscount ? order.subtotal - preVat : 0;

  return (
    <div className="sa-orders">
      <div className="sa-detail-header">
        <div>
          <Link href="/super-admin/orders" className="sa-back-link">
            ← Back to Orders
          </Link>
          <h1 className="sa-detail-title">
            Order <span className="sa-order-number">{order.orderNumber}</span>
          </h1>
        </div>
        <div className="sa-detail-actions">
          {canResend && (
            <button
              className="sa-action-btn sa-action-btn-primary"
              onClick={handleResendEmail}
              disabled={resending}
            >
              {resending ? "Sending…" : "Resend Ticket Email"}
            </button>
          )}
          {canCancel && (
            <button
              className="sa-action-btn sa-action-btn-danger"
              onClick={handleCancelOrder}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </button>
          )}
        </div>
      </div>

      {/* Status row */}
      <div className="sa-detail-status">
        <StatusPill status={order.status} />
        <MethodPill method={paymentMethod} />
      </div>

      {/* Two-column grid */}
      <div className="sa-detail-grid">
        {/* Customer card */}
        <section className="sa-detail-card">
          <h2 className="sa-detail-card-title">Customer</h2>
          <dl className="sa-detail-dl">
            <div>
              <dt>Name</dt>
              <dd>{order.customerName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${order.customerEmail}`}>
                  {order.customerEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
              </dd>
            </div>
          </dl>
        </section>

        {/* Event card */}
        <section className="sa-detail-card">
          <h2 className="sa-detail-card-title">Event</h2>
          {event ? (
            <dl className="sa-detail-dl">
              <div>
                <dt>Title</dt>
                <dd>{event.title}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{event.eventTime}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{event.location}</dd>
              </div>
            </dl>
          ) : (
            <p className="sa-detail-muted">Event no longer exists.</p>
          )}
        </section>
      </div>

      {/* Totals card */}
      <section className="sa-detail-card sa-detail-card-full">
        <h2 className="sa-detail-card-title">Payment Summary</h2>
        <div className="sa-summary-grid">
          {hasDiscount ? (
            <>
              <SummaryRow
                label="Tickets subtotal (excl. VAT)"
                value={preNet}
              />
              <SummaryRow
                label={`VAT (${vatRate}%)`}
                value={preVat}
              />
              <SummaryRow label="Tickets total" value={order.subtotal} />
              <SummaryRow
                label={`Discount (${order.discountCode})`}
                value={-order.discountAmount}
                variant="discount"
              />
              <SummaryRow
                label="Total"
                value={order.totalPrice}
                emphasized
              />
            </>
          ) : (
            <>
              <SummaryRow
                label="Tickets subtotal (excl. VAT)"
                value={netAmount}
              />
              <SummaryRow label={`VAT (${vatRate}%)`} value={vatAmount} />
              <SummaryRow
                label="Total"
                value={order.totalPrice}
                emphasized
              />
            </>
          )}
        </div>
      </section>

      {/* Tickets card */}
      <section className="sa-detail-card sa-detail-card-full">
        <div className="sa-detail-card-header">
          <h2 className="sa-detail-card-title">Tickets ({tickets.length})</h2>
          {tickets.length > 0 && (
            <span className="sa-detail-muted">
              {scannedCount} scanned · {tickets.length - scannedCount} remaining
            </span>
          )}
        </div>

        {tickets.length === 0 ? (
          <p className="sa-detail-muted">No tickets for this order.</p>
        ) : (
          <div className="sa-ticket-list">
            {tickets.map((t) => (
              <div
                key={t.id}
                className={`sa-ticket-row ${t.isScanned ? "scanned" : ""}`}
              >
                <div className="sa-ticket-left">
                  <div className="sa-ticket-type">
                    {t.categoryName ?? "—"} — {t.typeName ?? "—"}
                  </div>
                  <div className="sa-ticket-number sa-order-number">
                    {t.ticketNumber}
                  </div>
                </div>
                <div className="sa-ticket-right">
                  {t.isScanned ? (
                    <span className="sa-scan-badge sa-scan-badge-used">
                      Scanned {formatDate(t.scannedAt)}
                    </span>
                  ) : (
                    <span className="sa-scan-badge sa-scan-badge-valid">
                      Valid
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="sa-detail-card sa-detail-card-full">
        <h2 className="sa-detail-card-title">Timeline</h2>
        <div className="sa-timeline">
          <TimelineRow
            label="Order created"
            value={null}
            hint="Pending"
            done={true}
          />
          <TimelineRow
            label="Payment confirmed"
            value={order.paidAt}
            done={!!order.paidAt}
          />
          <TimelineRow
            label="Ticket email sent"
            value={order.ticketEmailSentAt}
            done={!!order.ticketEmailSentAt}
          />
        </div>
      </section>
    </div>
  );
}

// ======================================================
// Sub-components
// ======================================================

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "sa-pill-success",
    pending: "sa-pill-warn",
    pending_benefit: "sa-pill-warn",
    cancelled: "sa-pill-danger",
    refunded: "sa-pill-neutral",
  };
  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`sa-pill ${map[status] ?? "sa-pill-neutral"}`}>{label}</span>
  );
}

function MethodPill({ method }: { method: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    card: { cls: "sa-pill-info", label: "Card" },
    epassi: { cls: "sa-pill-epassi", label: "ePassi" },
    edenred: { cls: "sa-pill-edenred", label: "Edenred" },
  };
  const m = map[method] ?? { cls: "sa-pill-neutral", label: method };
  return <span className={`sa-pill ${m.cls}`}>{m.label}</span>;
}

function SummaryRow({
  label,
  value,
  emphasized,
  variant,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
  variant?: "discount";
}) {
  // Handle negative amounts (e.g. discount) with a proper minus sign + absolute value
  const isNegative = value < 0;
  const formatted = `${isNegative ? "−" : ""}€${(
    Math.abs(value) / 100
  ).toFixed(2)}`;

  const cls = [
    "sa-summary-row",
    emphasized ? "emphasized" : "",
    variant === "discount" ? "sa-summary-row-discount" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <span className="sa-summary-label">{label}</span>
      <span className="sa-summary-value">{formatted}</span>
    </div>
  );
}

function TimelineRow({
  label,
  value,
  hint,
  done,
}: {
  label: string;
  value: string | null;
  hint?: string;
  done: boolean;
}) {
  return (
    <div className={`sa-timeline-row ${done ? "done" : ""}`}>
      <span className="sa-timeline-dot" />
      <div className="sa-timeline-content">
        <div className="sa-timeline-label">{label}</div>
        <div className="sa-timeline-value">
          {value ? formatDate(value) : hint ?? "—"}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}