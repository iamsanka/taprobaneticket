"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./Reports.css";

type KPI = {
  totalRevenue: number;
  // ⭐ NEW — discount aggregates
  totalDiscount: number;
  grossRevenue: number;
  discountOrderCount: number;
  discountPercent: number;
  netAmount: number;
  vatAmount: number;
  vatRatePercent: number;
  paidOrderCount: number;
  totalTickets: number;
  totalScanned: number;
  scannedPercent: number;
  avgOrderValue: number;
  cardRevenue: number;
  epassiRevenue: number;
  edenredRevenue: number;
  statusCounts: Record<string, number>;
};

type PerEventRow = {
  eventId: number;
  eventTitle: string;
  orderCount: number;
  ticketCount: number;
  scannedCount: number;
  revenue: number;
  // ⭐ NEW
  discountTotal: number;
};

type ReportOrder = {
  id: number;
  orderNumber: string;
  eventId: number;
  eventTitle: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number;
  // ⭐ NEW
  discountCode: string | null;
  discountAmount: number;
  status: string;
  method: "card" | "epassi" | "edenred";
  paidAt: string | null;
  createdAt: string;
  ticketCount: number;
  scannedCount: number;
};

type AvailableEvent = { id: number; title: string };

type ApiResponse = {
  kpi: KPI;
  perEvent: PerEventRow[];
  orders: ReportOrder[];
  availableEvents: AvailableEvent[];
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending (card)" },
  { value: "pending_benefit", label: "Pending (benefit)" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const METHOD_OPTIONS = [
  { value: "all", label: "All methods" },
  { value: "card", label: "Card" },
  { value: "epassi", label: "ePassi" },
  { value: "edenred", label: "Edenred" },
];

const PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ReportsPage() {
  const router = useRouter();

  // ---- Filters ----
  const [eventId, setEventId] = useState<string>("all");
  const [status, setStatus] = useState<string>("paid");
  const [method, setMethod] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // ---- Data ----
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Resolve preset to actual dates ----
  useEffect(() => {
    if (datePreset === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (datePreset === "custom") {
      return;
    }

    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);

    if (datePreset === "today") {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (datePreset === "week") {
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (datePreset === "month") {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (datePreset === "year") {
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    }

    setDateFrom(toIsoDate(from));
    setDateTo(toIsoDate(to));
  }, [datePreset]);

  // ---- Build query string ----
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (eventId !== "all") p.set("eventId", eventId);
    if (status !== "all") p.set("status", status);
    if (method !== "all") p.set("method", method);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [eventId, status, method, dateFrom, dateTo]);

  // ---- Load ----
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/reports${queryString ? "?" + queryString : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
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
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setEventId("all");
    setStatus("paid");
    setMethod("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  }

  function downloadCsv() {
    const qs = queryString ? `?${queryString}` : "";
    window.location.href = `/api/super-admin/reports/export${qs}`;
  }

  return (
    <div className="rp-page">
      {/* ---- Header ---- */}
      <header className="rp-header">
        <div>
          <h1 className="rp-title">Reports</h1>
          <p className="rp-subtitle">
            Filter, analyse, and export order data
          </p>
        </div>
        <button
          className="rp-download-btn"
          onClick={downloadCsv}
          disabled={loading || !data}
        >
          <DownloadIcon />
          Download CSV
        </button>
      </header>

      {/* ---- Filters ---- */}
      <section className="rp-filters">
        <div className="rp-filter-row">
          <div className="rp-filter">
            <label className="rp-filter-label">Event</label>
            <select
              className="rp-select"
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

          <div className="rp-filter">
            <label className="rp-filter-label">Status</label>
            <select
              className="rp-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-filter">
            <label className="rp-filter-label">Method</label>
            <select
              className="rp-select"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-filter">
            <label className="rp-filter-label">Date range</label>
            <select
              className="rp-select"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="rp-filter-row rp-filter-row-custom">
            <div className="rp-filter">
              <label className="rp-filter-label">From</label>
              <input
                type="date"
                className="rp-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="rp-filter">
              <label className="rp-filter-label">To</label>
              <input
                type="date"
                className="rp-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="rp-filter-actions">
          <button className="rp-reset-btn" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      </section>

      {loading && (
        <div className="rp-state">
          <div className="rp-state-spinner" />
          <p className="rp-state-text">Loading report…</p>
        </div>
      )}

      {error && <div className="rp-error">{error}</div>}

      {!loading && !error && data && (
        <>
          {/* ========================================== */}
          {/* KPI cards                                  */}
          {/* ========================================== */}
          <section className="rp-kpi-grid">
            <KpiCard
              label="Total Revenue"
              value={formatEuro(data.kpi.totalRevenue)}
              sub={`${data.kpi.paidOrderCount} paid ${
                data.kpi.paidOrderCount === 1 ? "order" : "orders"
              }`}
              tone="primary"
            />
            {/* ⭐ NEW — Gross Revenue (pre-discount) */}
            <KpiCard
              label="Gross Revenue"
              value={formatEuro(data.kpi.grossRevenue)}
              sub={
                data.kpi.totalDiscount > 0
                  ? `Before ${formatEuro(data.kpi.totalDiscount)} in discounts`
                  : "No discounts applied"
              }
              tone="default"
            />
            <KpiCard
              label={`VAT (${data.kpi.vatRatePercent}%)`}
              value={formatEuro(data.kpi.vatAmount)}
              sub={`Net ${formatEuro(data.kpi.netAmount)}`}
              tone="accent"
            />
            <KpiCard
              label="Tickets Sold"
              value={String(data.kpi.totalTickets)}
              sub={`Avg order ${formatEuro(data.kpi.avgOrderValue)}`}
              tone="default"
            />
            <KpiCard
              label="Checked In"
              value={String(data.kpi.totalScanned)}
              sub={`${data.kpi.scannedPercent.toFixed(1)}% of ${
                data.kpi.totalTickets
              } tickets`}
              tone="success"
            />
            <KpiCard
              label="Discounts Given"
              value={formatEuro(data.kpi.totalDiscount)}
              sub={
                data.kpi.discountOrderCount > 0
                  ? `${data.kpi.discountOrderCount} ${
                      data.kpi.discountOrderCount === 1 ? "order" : "orders"
                    } · ${data.kpi.discountPercent.toFixed(1)}% of gross`
                  : "No discounts applied"
              }
              tone="discount"
            />
          </section>

          {/* ========================================== */}
          {/* Revenue by method                          */}
          {/* ========================================== */}
          <section className="rp-card">
            <h2 className="rp-card-title">Revenue by Payment Method</h2>
            <div className="rp-method-grid">
              <MethodStat
                label="Card"
                value={data.kpi.cardRevenue}
                total={data.kpi.totalRevenue}
                tone="primary"
              />
              <MethodStat
                label="ePassi"
                value={data.kpi.epassiRevenue}
                total={data.kpi.totalRevenue}
                tone="epassi"
              />
              <MethodStat
                label="Edenred"
                value={data.kpi.edenredRevenue}
                total={data.kpi.totalRevenue}
                tone="edenred"
              />
            </div>
          </section>

          {/* ========================================== */}
          {/* Per-event breakdown — clickable rows       */}
          {/* ========================================== */}
          <section className="rp-card">
            <div className="rp-card-header">
              <h2 className="rp-card-title">
                Revenue by Event ({data.perEvent.length})
              </h2>
            </div>

            {data.perEvent.length === 0 ? (
              <p className="rp-empty">No paid orders match these filters.</p>
            ) : (
              <div className="rp-table-wrap">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th className="rp-td-right">Orders</th>
                      <th className="rp-td-right">Tickets</th>
                      <th className="rp-td-right">Scanned</th>
                      {/* ⭐ NEW */}
                      <th className="rp-td-right">Discounts</th>
                      <th className="rp-td-right">Revenue</th>
                      <th className="rp-td-right">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perEvent.map((row) => (
                      <tr
                        key={row.eventId}
                        onClick={() =>
                          router.push(
                            `/super-admin/reports/event/${row.eventId}`
                          )
                        }
                        style={{ cursor: "pointer" }}
                        className="rp-row-clickable"
                      >
                        <td className="rp-td-strong">{row.eventTitle}</td>
                        <td className="rp-td-right">{row.orderCount}</td>
                        <td className="rp-td-right">{row.ticketCount}</td>
                        <td className="rp-td-right">
                          {row.scannedCount}
                          {row.ticketCount > 0 && (
                            <span className="rp-pct">
                              {" "}
                              (
                              {Math.round(
                                (row.scannedCount / row.ticketCount) * 100
                              )}
                              %)
                            </span>
                          )}
                        </td>
                        {/* ⭐ NEW — discount column */}
                        <td className="rp-td-right">
                          {row.discountTotal > 0 ? (
                            <span className="rp-discount">
                              −{formatEuro(row.discountTotal)}
                            </span>
                          ) : (
                            <span className="rp-td-muted">—</span>
                          )}
                        </td>
                        <td className="rp-td-right rp-td-strong">
                          {formatEuro(row.revenue)}
                        </td>
                        <td className="rp-td-right">
                          <span className="rp-view-btn">
                            View
                            <ChevronRightIcon />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ========================================== */}
          {/* Orders table                               */}
          {/* ========================================== */}
          <section className="rp-card">
            <div className="rp-card-header">
              <h2 className="rp-card-title">
                Orders ({data.orders.length})
              </h2>
            </div>

            {data.orders.length === 0 ? (
              <p className="rp-empty">No orders match these filters.</p>
            ) : (
              <div className="rp-table-wrap">
                <table className="rp-table rp-table-orders">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Event</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th className="rp-td-right">Tickets</th>
                      {/* ⭐ NEW */}
                      <th className="rp-td-right">Discount</th>
                      <th className="rp-td-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() =>
                          router.push(`/super-admin/orders/${o.id}`)
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <span className="rp-order-number">
                            {o.orderNumber}
                          </span>
                        </td>
                        <td className="rp-td-muted">
                          {formatDateShort(o.createdAt)}
                        </td>
                        <td>
                          <div className="rp-customer-name">
                            {o.customerName}
                          </div>
                          <div className="rp-customer-email">
                            {o.customerEmail}
                          </div>
                        </td>
                        <td>{o.eventTitle ?? "—"}</td>
                        <td>
                          <span className={`rp-pill rp-pill-${o.method}`}>
                            {o.method === "card"
                              ? "Card"
                              : o.method === "epassi"
                              ? "ePassi"
                              : "Edenred"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`rp-pill rp-pill-status-${o.status}`}
                          >
                            {formatStatusLabel(o.status)}
                          </span>
                        </td>
                        <td className="rp-td-right">
                          {o.scannedCount}/{o.ticketCount}
                        </td>
                        {/* ⭐ NEW — discount column */}
                        <td className="rp-td-right">
                          {o.discountAmount > 0 ? (
                            <span
                              className="rp-discount"
                              title={o.discountCode ?? undefined}
                            >
                              −{formatEuro(o.discountAmount)}
                            </span>
                          ) : (
                            <span className="rp-td-muted">—</span>
                          )}
                        </td>
                        <td className="rp-td-right rp-td-strong">
                          {formatEuro(o.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
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
}: {
  label: string;
  value: string;
  sub: string;
  // ⭐ NEW — "discount" tone added
  tone: "primary" | "accent" | "success" | "default" | "discount";
}) {
  return (
    <div className={`rp-kpi rp-kpi-${tone}`}>
      <div className="rp-kpi-label">{label}</div>
      <div className="rp-kpi-value">{value}</div>
      <div className="rp-kpi-sub">{sub}</div>
    </div>
  );
}

function MethodStat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "primary" | "epassi" | "edenred";
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className={`rp-method rp-method-${tone}`}>
      <div className="rp-method-top">
        <span className="rp-method-label">{label}</span>
        <span className="rp-method-pct">{pct.toFixed(0)}%</span>
      </div>
      <div className="rp-method-value">{formatEuro(value)}</div>
      <div className="rp-method-bar">
        <span
          className="rp-method-bar-fill"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ======================================================
// Icons
// ======================================================

function DownloadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}