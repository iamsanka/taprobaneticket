"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./StaffDashboard.css";

type KPI = {
  totalRevenue: number;
  netAmount: number;
  vatAmount: number;
  vatRatePercent: number;
  ticketCount: number;
  scannedCount: number;
  scannedPercent: number;
  orderCount: number;
};

type ByMethod = {
  card: number;
  epassi: number;
  edenred: number;
};

type PerEventRow = {
  eventId: number;
  eventTitle: string;
  orderCount: number;
  ticketCount: number;
  scannedCount: number;
  revenue: number;
};

type EventOption = { id: number; title: string };

type DashboardResponse = {
  kpi: KPI;
  byMethod: ByMethod;
  perEvent: PerEventRow[];
  availableEvents: EventOption[];
  ongoingEvent: { id: number; title: string } | null;
  filter: { eventId: number | null; isAllEvents: boolean };
};

function formatEuro(cents: number): string {
  return `€${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function StaffDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [eventId, setEventId] = useState<string>("all");

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const qs = id === "all" ? "" : `?eventId=${id}`;
      const res = await fetch(`/api/staff/dashboard${qs}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Total revenue across methods for the % breakdown
  const methodTotal = useMemo(() => {
    if (!data) return 0;
    return (
      data.byMethod.card + data.byMethod.epassi + data.byMethod.edenred
    );
  }, [data]);

  return (
    <div className="sd-page">
      {/* ---- Header ---- */}
      <header className="sd-header">
        <div>
          <h1 className="sd-title">Dashboard</h1>
          <p className="sd-subtitle">
            {data?.filter.isAllEvents
              ? data?.ongoingEvent
                ? `Overview across all events · Currently live: ${data.ongoingEvent.title}`
                : "Overview across all events"
              : data?.ongoingEvent
              ? `Overview for ${data.ongoingEvent.title}`
              : "Overview"}
          </p>
        </div>

        {/* ---- Filter ---- */}
        <div className="sd-filter">
          <label className="sd-filter-label" htmlFor="sd-event-filter">
            Event
          </label>
          <select
            id="sd-event-filter"
            className="sd-filter-select"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="all">All events</option>
            {data?.availableEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
      </header>

      {loading && !data && (
        <div className="sd-state">
          <div className="sd-state-spinner" />
          <p className="sd-state-text">Loading dashboard…</p>
        </div>
      )}

      {error && <div className="sd-error">{error}</div>}

      {data && (
        <>
          {/* ============================================== */}
          {/* Primary KPI cards                              */}
          {/* ============================================== */}
          <section className="sd-kpi-grid">
            <div className="sd-kpi sd-kpi-primary">
              <div className="sd-kpi-header">
                <span className="sd-kpi-label">Total Revenue</span>
                <span className="sd-kpi-icon sd-kpi-icon-primary">
                  <RevenueIcon />
                </span>
              </div>
              <div className="sd-kpi-value">
                {formatEuro(data.kpi.totalRevenue)}
              </div>
              <div className="sd-kpi-hint">
                Net {formatEuro(data.kpi.netAmount)} · VAT{" "}
                {formatEuro(data.kpi.vatAmount)}
              </div>
            </div>

            <div className="sd-kpi sd-kpi-accent">
              <div className="sd-kpi-header">
                <span className="sd-kpi-label">
                  VAT ({data.kpi.vatRatePercent}%)
                </span>
                <span className="sd-kpi-icon sd-kpi-icon-accent">
                  <VatIcon />
                </span>
              </div>
              <div className="sd-kpi-value">
                {formatEuro(data.kpi.vatAmount)}
              </div>
              <div className="sd-kpi-hint">
                From {formatEuro(data.kpi.totalRevenue)} gross
              </div>
            </div>

            <div className="sd-kpi sd-kpi-default">
              <div className="sd-kpi-header">
                <span className="sd-kpi-label">Tickets Sold</span>
                <span className="sd-kpi-icon sd-kpi-icon-default">
                  <TicketIcon />
                </span>
              </div>
              <div className="sd-kpi-value">{data.kpi.ticketCount}</div>
              <div className="sd-kpi-hint">
                {data.kpi.orderCount}{" "}
                {data.kpi.orderCount === 1 ? "order" : "orders"} total
              </div>
            </div>

            <div className="sd-kpi sd-kpi-success">
              <div className="sd-kpi-header">
                <span className="sd-kpi-label">Checked In</span>
                <span className="sd-kpi-icon sd-kpi-icon-success">
                  <CheckIcon />
                </span>
              </div>
              <div className="sd-kpi-value">{data.kpi.scannedCount}</div>
              <div className="sd-kpi-hint">
                {data.kpi.scannedPercent.toFixed(1)}% of{" "}
                {data.kpi.ticketCount} tickets
              </div>
            </div>
          </section>

          {/* ============================================== */}
          {/* Revenue by payment method                      */}
          {/* ============================================== */}
          <section className="sd-card">
            <div className="sd-card-header">
              <div>
                <h2 className="sd-card-title">Revenue by Payment Method</h2>
                <p className="sd-card-subtitle">
                  Gross revenue split by payment channel
                </p>
              </div>
            </div>

            <div className="sd-method-grid">
              <MethodBar
                label="Card"
                value={data.byMethod.card}
                total={methodTotal}
                tone="card"
              />
              <MethodBar
                label="ePassi"
                value={data.byMethod.epassi}
                total={methodTotal}
                tone="epassi"
              />
              <MethodBar
                label="Edenred"
                value={data.byMethod.edenred}
                total={methodTotal}
                tone="edenred"
              />
            </div>
          </section>

          {/* ============================================== */}
          {/* Revenue by event                               */}
          {/* ============================================== */}
          <section className="sd-card">
            <div className="sd-card-header">
              <div>
                <h2 className="sd-card-title">
                  Revenue by Event ({data.perEvent.length})
                </h2>
                <p className="sd-card-subtitle">
                  Orders, tickets, and revenue per event
                </p>
              </div>
            </div>

            {data.perEvent.length === 0 ? (
              <p className="sd-empty">
                No paid orders match this filter yet.
              </p>
            ) : (
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th className="sd-td-right">Orders</th>
                      <th className="sd-td-right">Tickets</th>
                      <th className="sd-td-right">Checked In</th>
                      <th className="sd-td-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perEvent.map((row) => (
                      <tr
                        key={row.eventId}
                        onClick={() => setEventId(String(row.eventId))}
                        style={{ cursor: "pointer" }}
                        className="sd-row-clickable"
                      >
                        <td className="sd-td-strong">{row.eventTitle}</td>
                        <td className="sd-td-right">{row.orderCount}</td>
                        <td className="sd-td-right">{row.ticketCount}</td>
                        <td className="sd-td-right">
                          {row.scannedCount}
                          {row.ticketCount > 0 && (
                            <span className="sd-pct">
                              {" "}
                              (
                              {Math.round(
                                (row.scannedCount / row.ticketCount) * 100
                              )}
                              %)
                            </span>
                          )}
                        </td>
                        <td className="sd-td-right sd-td-strong">
                          {formatEuro(row.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!data.filter.isAllEvents && (
              <div className="sd-filter-reset">
                <button
                  className="sd-reset-btn"
                  onClick={() => setEventId("all")}
                >
                  ← Back to all events
                </button>
              </div>
            )}
          </section>

          {/* ============================================== */}
          {/* Quick links                                    */}
          {/* ============================================== */}
          <section className="sd-quick-links">
            <Link href="/staff/scanner" className="sd-quick-card">
              <span className="sd-quick-icon">
                <ScanIcon />
              </span>
              <div className="sd-quick-text">
                <div className="sd-quick-title">Open Scanner</div>
                <div className="sd-quick-desc">
                  Validate tickets at the door
                </div>
              </div>
            </Link>

            <Link href="/staff/reports" className="sd-quick-card">
              <span className="sd-quick-icon">
                <ChartIcon />
              </span>
              <div className="sd-quick-text">
                <div className="sd-quick-title">View Reports</div>
                <div className="sd-quick-desc">
                  Detailed data and CSV export
                </div>
              </div>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

// ======================================================
// Method bar
// ======================================================

function MethodBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "card" | "epassi" | "edenred";
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className={`sd-method sd-method-${tone}`}>
      <div className="sd-method-top">
        <span className="sd-method-label">{label}</span>
        <span className="sd-method-pct">{pct.toFixed(0)}%</span>
      </div>
      <div className="sd-method-value">{formatEuro(value)}</div>
      <div className="sd-method-bar">
        <span
          className="sd-method-bar-fill"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function RevenueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function VatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <circle cx="9.5" cy="9.5" r="1.5" />
      <circle cx="14.5" cy="14.5" r="1.5" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <line x1="13" y1="8" x2="13" y2="16" strokeDasharray="2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}