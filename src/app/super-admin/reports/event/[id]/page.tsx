"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import "./EventFinance.css";

type MethodStats = {
  orderCount: number;
  grossRevenue: number;
  fees: number;
  netRevenue: number;
};

// ⭐ NEW — one row per discount code that was used on this event
type DiscountPerCode = {
  code: string;
  percentage: number | null;
  uses: number;
  total: number;
};

type EventFinance = {
  event: {
    id: number;
    title: string;
    eventTime: string;
    location: string;
    visibility: string;
  };
  kpi: {
    ticketSalesGross: number;
    ticketSalesNet: number;
    ticketFees: number;
    ticketCount: number;
    scannedCount: number;
    incomeGross: number;
    incomeReceived: number;
    incomeOutstanding: number;
    expenseGross: number;
    expensePaid: number;
    expenseOutstanding: number;
    totalRevenueIn: number;
    totalExpensesPaid: number;
    netPosition: number;
    remainingCommitments: number;
    fundingRequired: number;
    // ⭐ NEW — discount aggregates
    ticketGrossBeforeDiscount: number;
    discountsTotal: number;
    discountsOrderCount: number;
  };
  // ⭐ NEW — discount breakdown block
  discounts: {
    total: number;
    orderCount: number;
    grossBeforeDiscount: number;
    perCode: DiscountPerCode[];
  };
  byMethod: {
    card: MethodStats;
    epassi: MethodStats;
    edenred: MethodStats;
  };
  incomes: Array<{
    id: number;
    category: string;
    title: string;
    payer: string | null;
    grossAmount: number;
    receivedAmount: number;
    balanceAmount: number;
    status: string;
    dueDate: string | null;
  }>;
  expenses: Array<{
    id: number;
    category: string;
    title: string;
    supplier: string | null;
    subCategory: string | null;
    grossAmount: number;
    paidAmount: number;
    balanceAmount: number;
    status: string;
    dueDate: string | null;
  }>;
};

const INCOME_CATEGORY_LABELS: Record<string, string> = {
  director_share: "Director Share",
  sponsorship: "Sponsorship",
  donation: "Donation",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  artists_crew: "Artists & Crew",
  production_equipment: "Production & Equipment",
  event_venue: "Event & Venue",
  marketing: "Marketing",
  operations: "Operations",
  admin: "Admin",
  travel: "Travel",
  catering: "Catering",
  other: "Other",
};

function formatEuro(cents: number): string {
  return `€${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const eventId = Number(id);

  const [data, setData] = useState<EventFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/finance/event/${eventId}`,
        { credentials: "include" }
      );
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (loading) {
    return (
      <div className="efin-page">
        <div className="efin-state">
          <div className="efin-state-spinner" />
          <p className="efin-state-text">Loading event report…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="efin-page">
        <Link href="/super-admin/reports" className="efin-back">
          <ArrowLeftIcon />
          Back to Reports
        </Link>
        <div className="efin-error">{error || "Event not found"}</div>
      </div>
    );
  }

  const { event, kpi, byMethod, incomes, expenses, discounts } = data;
  const fundingPositive = kpi.fundingRequired > 0;
  const hasDiscounts = discounts.total > 0;

  return (
    <div className="efin-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/reports" className="efin-back">
        <ArrowLeftIcon />
        Back to Reports
      </Link>

      {/* ---- Header ---- */}
      <header className="efin-header">
        <div>
          <span className="efin-eyebrow">Event Report</span>
          <h1 className="efin-title">{event.title}</h1>
          <p className="efin-subtitle">
            {event.eventTime} · {event.location}
          </p>
        </div>
        <button
          className="efin-refresh-btn"
          onClick={load}
          disabled={loading}
        >
          <RefreshIcon />
          Refresh
        </button>
      </header>

      {/* ================================================== */}
      {/* Top row — 3 headline KPIs                          */}
      {/* ================================================== */}
      <section className="efin-kpi-row">
        <div className="efin-kpi efin-kpi-primary">
          <div className="efin-kpi-header">
            <span className="efin-kpi-label">Net Position</span>
            <span className="efin-kpi-icon efin-kpi-icon-primary">
              <BankIcon />
            </span>
          </div>
          <div className="efin-kpi-value">{formatEuro(kpi.netPosition)}</div>
          <div className="efin-kpi-hint">
            Revenue in {formatEuro(kpi.totalRevenueIn)} · Expenses paid{" "}
            {formatEuro(kpi.totalExpensesPaid)}
          </div>
        </div>

        <div className="efin-kpi efin-kpi-amber">
          <div className="efin-kpi-header">
            <span className="efin-kpi-label">Remaining Commitments</span>
            <span className="efin-kpi-icon efin-kpi-icon-amber">
              <CommitmentIcon />
            </span>
          </div>
          <div className="efin-kpi-value">
            {formatEuro(kpi.remainingCommitments)}
          </div>
          <div className="efin-kpi-hint">
            Outstanding expenses · {formatEuro(kpi.expensePaid)} of{" "}
            {formatEuro(kpi.expenseGross)} already paid
          </div>
        </div>

        <div
          className={`efin-kpi ${
            fundingPositive ? "efin-kpi-danger" : "efin-kpi-success"
          }`}
        >
          <div className="efin-kpi-header">
            <span className="efin-kpi-label">Funding Required</span>
            <span
              className={`efin-kpi-icon ${
                fundingPositive
                  ? "efin-kpi-icon-danger"
                  : "efin-kpi-icon-success"
              }`}
            >
              {fundingPositive ? <AlertIcon /> : <CheckCircleIcon />}
            </span>
          </div>
          <div className="efin-kpi-value">
            {formatEuro(kpi.fundingRequired)}
          </div>
          <div className="efin-kpi-hint">
            {fundingPositive
              ? "Outstanding expenses exceed revenue received"
              : "Revenue received covers all outstanding expenses"}
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* Second row — detailed tiles                        */}
      {/* ================================================== */}
      <section className="efin-tiles-row">
        <div className="efin-tile">
          <span className="efin-tile-label">Tickets Sold</span>
          <span className="efin-tile-value">{kpi.ticketCount}</span>
          <span className="efin-tile-hint">
            {kpi.scannedCount} scanned ·{" "}
            {kpi.ticketCount > 0
              ? Math.round((kpi.scannedCount / kpi.ticketCount) * 100)
              : 0}
            %
          </span>
        </div>

        <div className="efin-tile">
          <span className="efin-tile-label">Ticket Gross</span>
          <span className="efin-tile-value">
            {formatEuro(kpi.ticketSalesGross)}
          </span>
          <span className="efin-tile-hint">
            Fees {formatEuro(kpi.ticketFees)}
          </span>
        </div>

        <div className="efin-tile efin-tile-success">
          <span className="efin-tile-label">Ticket Net</span>
          <span className="efin-tile-value">
            {formatEuro(kpi.ticketSalesNet)}
          </span>
          <span className="efin-tile-hint">After channel fees</span>
        </div>

        <div className="efin-tile efin-tile-success">
          <span className="efin-tile-label">Income Received</span>
          <span className="efin-tile-value">
            {formatEuro(kpi.incomeReceived)}
          </span>
          <span className="efin-tile-hint">
            of {formatEuro(kpi.incomeGross)} expected
          </span>
        </div>

        <div className="efin-tile efin-tile-danger">
          <span className="efin-tile-label">Expenses Outstanding</span>
          <span className="efin-tile-value">
            {formatEuro(kpi.expenseOutstanding)}
          </span>
          <span className="efin-tile-hint">
            Paid {formatEuro(kpi.expensePaid)}
          </span>
        </div>

        {/* ⭐ NEW — Discounts given on this event */}
        <div
          className={`efin-tile ${
            hasDiscounts ? "efin-tile-discount" : "efin-tile-muted"
          }`}
        >
          <span className="efin-tile-label">Discounts Given</span>
          <span className="efin-tile-value">
            {hasDiscounts ? `−${formatEuro(discounts.total)}` : "—"}
          </span>
          <span className="efin-tile-hint">
            {hasDiscounts
              ? `${discounts.orderCount} ${
                  discounts.orderCount === 1 ? "order" : "orders"
                } · before ${formatEuro(discounts.grossBeforeDiscount)}`
              : "No discounts applied"}
          </span>
        </div>
      </section>

      {/* ================================================== */}
      {/* ⭐ NEW — Discount breakdown per code               */}
      {/* ================================================== */}
      <section className="efin-card">
        <div className="efin-card-header">
          <div>
            <h2 className="efin-card-title">
              Discounts ({discounts.perCode.length})
            </h2>
            <p className="efin-card-subtitle">
              Codes used on this event and how much was discounted
            </p>
          </div>
          <Link
            href="/super-admin/discounts"
            className="efin-card-link"
          >
            Manage codes →
          </Link>
        </div>

        {discounts.perCode.length === 0 ? (
          <p className="efin-empty">
            No discount codes were used on this event.
          </p>
        ) : (
          <div className="efin-table-wrap">
            <table className="efin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="efin-td-right">Discount</th>
                  <th className="efin-td-right">Orders</th>
                  <th className="efin-td-right">Total Given</th>
                </tr>
              </thead>
              <tbody>
                {discounts.perCode.map((d) => (
                  <tr key={d.code}>
                    <td>
                      <span className="efin-discount-code">{d.code}</span>
                    </td>
                    <td className="efin-td-right efin-td-muted">
                      {d.percentage !== null ? `${d.percentage}%` : "—"}
                    </td>
                    <td className="efin-td-right">{d.uses}</td>
                    <td className="efin-td-right efin-td-strong efin-td-discount">
                      −{formatEuro(d.total)}
                    </td>
                  </tr>
                ))}
                {/* Footer totals row */}
                <tr className="efin-row-total">
                  <td className="efin-td-strong">Total</td>
                  <td />
                  <td className="efin-td-right efin-td-strong">
                    {discounts.orderCount}
                  </td>
                  <td className="efin-td-right efin-td-strong efin-td-discount">
                    −{formatEuro(discounts.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================================================== */}
      {/* Ticket channel breakdown                           */}
      {/* ================================================== */}
      <section className="efin-card">
        <div className="efin-card-header">
          <div>
            <h2 className="efin-card-title">Ticket Channel Performance</h2>
            <p className="efin-card-subtitle">
              Gross revenue, fees, and net per payment channel
            </p>
          </div>
        </div>

        <div className="efin-channel-grid">
          <ChannelCard
            label="Card / Stripe"
            stats={byMethod.card}
            tone="card"
          />
          <ChannelCard
            label="ePassi"
            stats={byMethod.epassi}
            tone="epassi"
          />
          <ChannelCard
            label="Edenred"
            stats={byMethod.edenred}
            tone="edenred"
          />
        </div>
      </section>

      {/* ================================================== */}
      {/* Income                                             */}
      {/* ================================================== */}
      <section className="efin-card">
        <div className="efin-card-header">
          <div>
            <h2 className="efin-card-title">Income ({incomes.length})</h2>
            <p className="efin-card-subtitle">
              All income records tied to this event
            </p>
          </div>
          <Link
            href="/super-admin/finance/income"
            className="efin-card-link"
          >
            Manage →
          </Link>
        </div>

        {incomes.length === 0 ? (
          <p className="efin-empty">
            No income records tied to this event yet.
          </p>
        ) : (
          <div className="efin-table-wrap">
            <table className="efin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Payer</th>
                  <th>Due</th>
                  <th className="efin-td-right">Gross</th>
                  <th className="efin-td-right">Received</th>
                  <th className="efin-td-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incomes.map((i) => (
                  <tr key={i.id}>
                    <td className="efin-td-strong">{i.title}</td>
                    <td>
                      <span className="efin-pill">
                        {INCOME_CATEGORY_LABELS[i.category] ?? i.category}
                      </span>
                    </td>
                    <td className="efin-td-muted">{i.payer ?? "—"}</td>
                    <td className="efin-td-muted">
                      {formatDate(i.dueDate)}
                    </td>
                    <td className="efin-td-right efin-td-strong">
                      {formatEuro(i.grossAmount)}
                    </td>
                    <td className="efin-td-right">
                      {formatEuro(i.receivedAmount)}
                    </td>
                    <td className="efin-td-right">
                      {formatEuro(i.balanceAmount)}
                    </td>
                    <td>
                      <span
                        className={`efin-pill efin-pill-status-${i.status}`}
                      >
                        {statusLabel(i.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================================================== */}
      {/* Expenses                                           */}
      {/* ================================================== */}
      <section className="efin-card">
        <div className="efin-card-header">
          <div>
            <h2 className="efin-card-title">
              Expenses ({expenses.length})
            </h2>
            <p className="efin-card-subtitle">
              All expense records tied to this event
            </p>
          </div>
          <Link
            href="/super-admin/finance/expenses"
            className="efin-card-link"
          >
            Manage →
          </Link>
        </div>

        {expenses.length === 0 ? (
          <p className="efin-empty">
            No expense records tied to this event yet.
          </p>
        ) : (
          <div className="efin-table-wrap">
            <table className="efin-table">
              <thead>
                <tr>
                  <th>Supplier / Expense</th>
                  <th>Category</th>
                  <th>Due</th>
                  <th className="efin-td-right">Gross</th>
                  <th className="efin-td-right">Paid</th>
                  <th className="efin-td-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const isOverdue =
                    e.dueDate &&
                    e.balanceAmount > 0 &&
                    new Date(e.dueDate) < new Date() &&
                    e.status !== "cancelled" &&
                    e.status !== "paid";

                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="efin-td-strong">
                          {e.supplier ?? e.title}
                        </div>
                        {e.supplier && (
                          <div className="efin-td-sub">{e.title}</div>
                        )}
                      </td>
                      <td>
                        <span className="efin-pill">
                          {EXPENSE_CATEGORY_LABELS[e.category] ??
                            e.category}
                        </span>
                      </td>
                      <td
                        className={
                          isOverdue ? "efin-td-overdue" : "efin-td-muted"
                        }
                      >
                        {formatDate(e.dueDate)}
                        {isOverdue && (
                          <span className="efin-overdue-tag">Overdue</span>
                        )}
                      </td>
                      <td className="efin-td-right efin-td-strong">
                        {formatEuro(e.grossAmount)}
                      </td>
                      <td className="efin-td-right">
                        {formatEuro(e.paidAmount)}
                      </td>
                      <td className="efin-td-right">
                        {formatEuro(e.balanceAmount)}
                      </td>
                      <td>
                        <span
                          className={`efin-pill efin-pill-status-${e.status}`}
                        >
                          {statusLabel(e.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ======================================================
// Channel card
// ======================================================

function ChannelCard({
  label,
  stats,
  tone,
}: {
  label: string;
  stats: MethodStats;
  tone: "card" | "epassi" | "edenred";
}) {
  return (
    <div className={`efin-channel efin-channel-${tone}`}>
      <div className="efin-channel-header">
        <span className="efin-channel-label">{label}</span>
        <span className="efin-channel-orders">
          {stats.orderCount} {stats.orderCount === 1 ? "order" : "orders"}
        </span>
      </div>
      <div className="efin-channel-body">
        <div className="efin-channel-row">
          <span className="efin-channel-row-label">Gross</span>
          <span className="efin-channel-row-value">
            {formatEuro(stats.grossRevenue)}
          </span>
        </div>
        <div className="efin-channel-row">
          <span className="efin-channel-row-label">Fees</span>
          <span className="efin-channel-row-value efin-channel-row-neg">
            −{formatEuro(stats.fees)}
          </span>
        </div>
        <div className="efin-channel-row efin-channel-row-total">
          <span className="efin-channel-row-label">Net</span>
          <span className="efin-channel-row-value">
            {formatEuro(stats.netRevenue)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// Icons
// ======================================================

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="6" y1="21" x2="6" y2="10" />
      <line x1="10" y1="21" x2="10" y2="10" />
      <line x1="14" y1="21" x2="14" y2="10" />
      <line x1="18" y1="21" x2="18" y2="10" />
      <polygon points="12 2 22 9 2 9" />
    </svg>
  );
}

function CommitmentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}