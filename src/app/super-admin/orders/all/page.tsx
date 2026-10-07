"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "../Orders.css";
import "./AllOrders.css";

type Order = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number;
  stripePaymentIntentId: string;
  status: string;
  paidAt: string | null;
  ticketEmailSentAt: string | null;
  eventTitle: string | null;
};

type StatusFilter =
  | "all"
  | "paid"
  | "pending_benefit"
  | "pending"
  | "cancelled"
  | "refunded";

type MethodFilter = "all" | "card" | "epassi" | "edenred";

type SortKey =
  | "newest"
  | "oldest"
  | "highest"
  | "lowest"
  | "status"
  | "method";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "pending_benefit", label: "Pending Benefit" },
  { key: "pending", label: "Pending Card" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
];

const METHOD_FILTERS: { key: MethodFilter; label: string }[] = [
  { key: "all", label: "All methods" },
  { key: "card", label: "Card" },
  { key: "epassi", label: "ePassi" },
  { key: "edenred", label: "Edenred" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "highest", label: "Highest total" },
  { key: "lowest", label: "Lowest total" },
  { key: "status", label: "Status (A → Z)" },
  { key: "method", label: "Payment method" },
];

function methodFromSentinel(
  sentinel: string
): "card" | "epassi" | "edenred" {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

function methodLabel(m: "card" | "epassi" | "edenred"): string {
  if (m === "epassi") return "ePassi";
  if (m === "edenred") return "Edenred";
  return "Card";
}

export default function AllOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/super-admin/orders/all", {
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error || `Failed to load orders (${res.status})`);
          return;
        }
        const data = await res.json();
        setOrders(data.orders ?? []);
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleResend(order: Order) {
    const ok = window.confirm(
      `Resend ticket email to ${order.customerEmail}?\n\n` +
        `Order: ${order.orderNumber}\n` +
        `The customer will receive a fresh email with all ticket PDFs and the invoice.`
    );
    if (!ok) return;

    setResendingId(order.id);
    try {
      const res = await fetch(
        `/api/super-admin/orders/${order.id}/resend-email`,
        { method: "POST", credentials: "include" }
      );
      const body = await res.json();

      if (!res.ok) {
        alert(body.error || "Failed to resend email");
        return;
      }

      alert(`Email resent for ${order.orderNumber}.`);

      // Refresh just this row's ticketEmailSentAt so the UI reflects it
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, ticketEmailSentAt: new Date().toISOString() }
            : o
        )
      );
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setResendingId(null);
    }
  }

  // -------------------- Filter + sort --------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;

      const m = methodFromSentinel(o.stripePaymentIntentId);
      if (methodFilter !== "all" && m !== methodFilter) return false;

      if (q) {
        const haystack = `${o.orderNumber} ${o.customerEmail} ${o.customerPhone} ${o.customerName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const statusOrder = ["paid", "pending_benefit", "pending", "refunded", "cancelled"];
    const methodOrder = ["card", "epassi", "edenred"];

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return b.id - a.id;
        case "oldest":
          return a.id - b.id;
        case "highest":
          return b.totalPrice - a.totalPrice;
        case "lowest":
          return a.totalPrice - b.totalPrice;
        case "status": {
          const ai = statusOrder.indexOf(a.status);
          const bi = statusOrder.indexOf(b.status);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        }
        case "method": {
          const am = methodOrder.indexOf(methodFromSentinel(a.stripePaymentIntentId));
          const bm = methodOrder.indexOf(methodFromSentinel(b.stripePaymentIntentId));
          return am - bm;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [orders, statusFilter, methodFilter, sortKey, search]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: orders.length,
      paid: 0,
      pending_benefit: 0,
      pending: 0,
      cancelled: 0,
      refunded: 0,
    };
    for (const o of orders) {
      if (o.status in map) map[o.status as StatusFilter] += 1;
    }
    return map;
  }, [orders]);

  return (
    <div className="sa-orders">
      <header className="sa-orders-header">
        <h1 className="sa-orders-title">All Orders</h1>
        <p className="sa-orders-subtitle">
          Every order across all payment methods and statuses
        </p>
      </header>

      {/* Search + Sort row */}
      <div className="sa-controls">
        <div className="sa-search-wrap">
          <svg
            className="sa-search-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="sa-search-input"
            placeholder="Search by order number, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="sa-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <select
          className="sa-sort-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Status tabs */}
      <div className="sa-filter-tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`sa-filter-tab ${statusFilter === f.key ? "active" : ""}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className="sa-filter-count">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Method filter chips */}
      <div className="sa-method-chips">
        {METHOD_FILTERS.map((m) => (
          <button
            key={m.key}
            className={`sa-method-chip ${methodFilter === m.key ? "active" : ""}`}
            onClick={() => setMethodFilter(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && <div className="sa-orders-empty">Loading orders…</div>}

      {error && <div className="sa-orders-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="sa-orders-empty">
          {orders.length === 0
            ? "No orders yet."
            : "No orders match your filters."}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="sa-orders-table-wrap">
          <table className="sa-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Method</th>
                <th>Status</th>
                <th className="sa-td-right">Total</th>
                <th className="sa-td-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/super-admin/orders/${o.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className="sa-order-number">{o.orderNumber}</span>
                  </td>
                  <td>
                    <div className="sa-customer-name">{o.customerName}</div>
                    <div className="sa-customer-meta">{o.customerEmail}</div>
                    <div className="sa-customer-meta">{o.customerPhone}</div>
                  </td>
                  <td>{o.eventTitle ?? "—"}</td>
                  <td>
                    <span className="sa-method-pill">
                      {methodLabel(methodFromSentinel(o.stripePaymentIntentId))}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  <td className="sa-td-right sa-td-total">
                    €{(o.totalPrice / 100).toFixed(2)}
                  </td>
                  <td className="sa-td-right">
                    {o.status === "paid" && (
                      <button
                        className="sa-resend-btn"
                        disabled={resendingId === o.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResend(o);
                        }}
                        title="Resend ticket email"
                      >
                        {resendingId === o.id ? "Sending…" : "Resend email"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <p className="sa-results-count">
          Showing {filtered.length} of {orders.length} orders
        </p>
      )}
    </div>
  );
}

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
    <span className={`sa-pill ${map[status] ?? "sa-pill-neutral"}`}>
      {label}
    </span>
  );
}