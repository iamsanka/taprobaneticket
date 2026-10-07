"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./Orders.css";

type PendingOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number;
  stripePaymentIntentId: string;
  status: string;
  eventTitle: string | null;
};

export default function SuperAdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  async function loadOrders() {
    setError(null);
    try {
      const res = await fetch("/api/super-admin/orders/pending-benefit", {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load orders");
        return;
      }

      setOrders(data.orders ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function confirmOrder(order: PendingOrder) {
    const ok = window.confirm(
      `Confirm payment received for ${order.orderNumber}?\n\n` +
        `${order.customerName} — €${(order.totalPrice / 100).toFixed(2)}\n\n` +
        `This will generate tickets and email the customer immediately.`
    );
    if (!ok) return;

    setConfirmingId(order.id);

    try {
      const res = await fetch(
        `/api/super-admin/orders/${order.id}/confirm-benefit`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to confirm");
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setConfirmingId(null);
    }
  }

  async function cancelOrder(order: PendingOrder) {
    const ok = window.confirm(
      `Cancel order ${order.orderNumber}?\n\n` +
        `Customer: ${order.customerName} (${order.customerEmail})\n` +
        `Total: €${(order.totalPrice / 100).toFixed(2)}\n\n` +
        `The order will be marked as CANCELLED and removed from this list.\n` +
        `It will appear in the Cancelled view. No email will be sent.`
    );
    if (!ok) return;

    setCancellingId(order.id);

    try {
      const res = await fetch(`/api/super-admin/orders/${order.id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to cancel");
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setCancellingId(null);
    }
  }

  function methodFromSentinel(sentinel: string): string {
    if (sentinel.startsWith("benefit_epassi_")) return "ePassi";
    if (sentinel.startsWith("benefit_edenred_")) return "Edenred";
    return "—";
  }

  return (
    <div className="sa-orders">
      <header className="sa-orders-header">
        <h1 className="sa-orders-title">Orders</h1>
        <p className="sa-orders-subtitle">
          Pending benefit payments awaiting confirmation
        </p>
      </header>

      {loading && <div className="sa-orders-empty">Loading orders…</div>}

      {error && <div className="sa-orders-error">{error}</div>}

      {!loading && !error && orders.length === 0 && (
        <div className="sa-orders-empty">
          No pending benefit orders. Everything is up to date. 🎉
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="sa-orders-table-wrap">
          <table className="sa-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Method</th>
                <th className="sa-td-right">Total</th>
                <th className="sa-td-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
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
                      {methodFromSentinel(o.stripePaymentIntentId)}
                    </span>
                  </td>
                  <td className="sa-td-right sa-td-total">
                    €{(o.totalPrice / 100).toFixed(2)}
                  </td>
                  <td className="sa-td-right">
                    <div className="sa-row-actions">
                      <button
                        className="sa-confirm-btn"
                        disabled={confirmingId === o.id || cancellingId === o.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmOrder(o);
                        }}
                      >
                        {confirmingId === o.id ? "Sending…" : "Confirm & Send"}
                      </button>
                      <button
                        className="sa-cancel-btn"
                        disabled={confirmingId === o.id || cancellingId === o.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelOrder(o);
                        }}
                      >
                        {cancellingId === o.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}