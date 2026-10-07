"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "../Orders.css";
import "../all/AllOrders.css";

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

export default function CancelledOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const cancelled = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => o.status === "cancelled")
      .filter((o) => {
        if (!q) return true;
        const haystack = `${o.orderNumber} ${o.customerEmail} ${o.customerPhone} ${o.customerName}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => b.id - a.id);
  }, [orders, search]);

  function methodFromSentinel(sentinel: string): string {
    if (sentinel.startsWith("benefit_epassi_")) return "ePassi";
    if (sentinel.startsWith("benefit_edenred_")) return "Edenred";
    return "Card";
  }

  return (
    <div className="sa-orders">
      <header className="sa-orders-header">
        <h1 className="sa-orders-title">Cancelled Orders</h1>
        <p className="sa-orders-subtitle">
          Orders that were manually cancelled before payment was received
        </p>
      </header>

      {cancelled.length > 0 && (
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
        </div>
      )}

      {loading && <div className="sa-orders-empty">Loading orders…</div>}

      {error && <div className="sa-orders-error">{error}</div>}

      {!loading && !error && cancelled.length === 0 && (
        <div className="sa-orders-empty">
          {search
            ? "No cancelled orders match your search."
            : "No cancelled orders yet."}
        </div>
      )}

      {!loading && !error && cancelled.length > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {cancelled.map((o) => (
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
                  </td>
                  <td>{o.eventTitle ?? "—"}</td>
                  <td>
                    <span className="sa-method-pill">
                      {methodFromSentinel(o.stripePaymentIntentId)}
                    </span>
                  </td>
                  <td>
                    <span className="sa-pill sa-pill-danger">Cancelled</span>
                  </td>
                  <td className="sa-td-right sa-td-total">
                    €{(o.totalPrice / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && cancelled.length > 0 && (
        <p className="sa-results-count">
          Showing {cancelled.length} cancelled{" "}
          {cancelled.length === 1 ? "order" : "orders"}
        </p>
      )}
    </div>
  );
}