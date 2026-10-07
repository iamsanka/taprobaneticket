"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./Dashboard.css";

type KPI = {
  totalRevenue: number;
  netAmount: number;
  vatAmount: number;
  paidOrderCount: number;
  ticketCount: number;
  scannedCount: number;
  scannedPercent: number;
  pendingCount: number;
};

type RecentOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalPrice: number;
  status: string;
  stripePaymentIntentId: string;
  eventTitle: string | null;
};

type EventSummary = {
  eventId: number;
  eventTitle: string;
  eventTime: string;
  visibility: string;
  ticketCount: number;
  scannedCount: number;
  revenue: number;
};

type ApiResponse = {
  kpi: KPI;
  recentOrders: RecentOrder[];
  eventSummary: EventSummary[];
};

export default function SuperAdminDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/super-admin/dashboard/stats", {
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error || `Failed to load dashboard (${res.status})`);
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
  }, []);

  if (loading) {
    return (
      <div className="sa-dashboard">
        <h1 className="sa-title">Dashboard</h1>
        <div className="sa-dashboard-loading">Loading analytics…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sa-dashboard">
        <h1 className="sa-title">Dashboard</h1>
        <div className="sa-dashboard-error">{error || "Failed to load"}</div>
      </div>
    );
  }

  const { kpi, recentOrders, eventSummary } = data;

  return (
    <div className="sa-dashboard">
      <header className="sa-dashboard-header">
        <h1 className="sa-title">Dashboard</h1>
        <p className="sa-dashboard-subtitle">
          Live overview of sales, tickets, and check-ins
        </p>
      </header>

      {/* ============ KPI CARDS ============ */}
      <section className="sa-kpi-grid">
        <KpiCard
          label="Total Revenue"
          value={formatEuro(kpi.totalRevenue)}
          sub={`Net ${formatEuro(kpi.netAmount)} · VAT ${formatEuro(kpi.vatAmount)}`}
          tone="primary"
        />
        <KpiCard
          label="Tickets Sold"
          value={String(kpi.ticketCount)}
          sub={`${kpi.paidOrderCount} paid ${kpi.paidOrderCount === 1 ? "order" : "orders"}`}
          tone="accent"
        />
        <KpiCard
          label="Checked In"
          value={String(kpi.scannedCount)}
          sub={`${kpi.scannedPercent.toFixed(1)}% of ${kpi.ticketCount} tickets`}
          tone="success"
        />
        <KpiCard
          label="Pending Actions"
          value={String(kpi.pendingCount)}
          sub={
            kpi.pendingCount > 0
              ? "Benefit orders awaiting confirmation"
              : "All caught up"
          }
          tone={kpi.pendingCount > 0 ? "warn" : "neutral"}
          href={kpi.pendingCount > 0 ? "/super-admin/orders" : undefined}
        />
      </section>

      {/* ============ TWO-COLUMN SECTION ============ */}
      <section className="sa-dashboard-grid">
        {/* ---- Recent Orders ---- */}
        <div className="sa-dashboard-card">
          <div className="sa-dashboard-card-header">
            <h2 className="sa-dashboard-card-title">Recent Orders</h2>
            <Link href="/super-admin/orders/all" className="sa-dashboard-link">
              View all →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="sa-dashboard-empty">No orders yet.</p>
          ) : (
            <div className="sa-recent-orders">
              {recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/super-admin/orders/${o.id}`}
                  className="sa-recent-order"
                >
                  <div className="sa-recent-order-left">
                    <div className="sa-recent-order-number sa-order-number">
                      {o.orderNumber}
                    </div>
                    <div className="sa-recent-order-customer">
                      {o.customerName}
                    </div>
                    <div className="sa-recent-order-meta">
                      {o.eventTitle ?? "—"}
                    </div>
                  </div>
                  <div className="sa-recent-order-right">
                    <div className="sa-recent-order-total">
                      {formatEuro(o.totalPrice)}
                    </div>
                    <StatusPill status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ---- Events Summary ---- */}
        <div className="sa-dashboard-card">
          <div className="sa-dashboard-card-header">
            <h2 className="sa-dashboard-card-title">Events</h2>
            <Link
              href="/super-admin/events"
              className="sa-dashboard-link"
            >
              Manage →
            </Link>
          </div>

          {eventSummary.length === 0 ? (
            <p className="sa-dashboard-empty">No events yet.</p>
          ) : (
            <div className="sa-events-list">
              {eventSummary.map((e) => {
                const percent =
                  e.ticketCount > 0
                    ? (e.scannedCount / e.ticketCount) * 100
                    : 0;
                return (
                  <div key={e.eventId} className="sa-event-row">
                    <div className="sa-event-info">
                      <div className="sa-event-title">{e.eventTitle}</div>
                      <div className="sa-event-meta">
                        {e.eventTime} · {e.visibility}
                      </div>
                    </div>
                    <div className="sa-event-stats">
                      <div className="sa-event-stat">
                        <span className="sa-event-stat-label">Tickets</span>
                        <span className="sa-event-stat-value">
                          {e.ticketCount}
                        </span>
                      </div>
                      <div className="sa-event-stat">
                        <span className="sa-event-stat-label">Scanned</span>
                        <span className="sa-event-stat-value">
                          {e.scannedCount}
                          <span className="sa-event-stat-percent">
                            {" "}
                            ({percent.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="sa-event-stat">
                        <span className="sa-event-stat-label">Revenue</span>
                        <span className="sa-event-stat-value">
                          {formatEuro(e.revenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ======================================================
// Sub-components
// ======================================================

function KpiCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "accent" | "success" | "warn" | "neutral";
  href?: string;
}) {
  const body = (
    <>
      <div className="sa-kpi-label">{label}</div>
      <div className="sa-kpi-value">{value}</div>
      <div className="sa-kpi-sub">{sub}</div>
    </>
  );

  const className = `sa-kpi-card sa-kpi-${tone}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
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

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}