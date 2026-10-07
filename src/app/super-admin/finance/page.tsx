"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./Finance.css";

type MethodStats = {
  orderCount: number;
  grossRevenue: number;
  fees: number;
  netRevenue: number;
};

type Summary = {
  bankBalance: {
    value: number;
    incomeReceived: number;
    ticketNetRevenue: number;
    expensesPaid: number;
  };
  remainingCommitments: {
    value: number;
    totalExpenses: number;
    totalPaid: number;
    outstanding: number;
  };
  fundingRequired: {
    value: number;
    reason: string;
  };
  income: {
    gross: number;
    received: number;
    outstanding: number;
  };
  expenses: {
    gross: number;
    paid: number;
    outstanding: number;
  };
  tickets: {
    grossRevenue: number;
    fees: number;
    netRevenue: number;
    orderCount: number;
  };
  byMethod: {
    card: MethodStats;
    epassi: MethodStats;
    edenred: MethodStats;
  };
};

function formatEuro(cents: number): string {
  return `€${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/finance/summary", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load finance summary (${res.status})`);
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
  }, []);

  return (
    <div className="fin-page">
      {/* ---- Header ---- */}
      <header className="fin-header">
        <div>
          <h1 className="fin-title">Finance</h1>
          <p className="fin-subtitle">
            Cash position, commitments, and payment channel costs
          </p>
        </div>
        <button
          className="fin-refresh-btn"
          onClick={load}
          disabled={loading}
        >
          <RefreshIcon />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {loading && !data && (
        <div className="fin-state">
          <div className="fin-state-spinner" />
          <p className="fin-state-text">Loading finance summary…</p>
        </div>
      )}

      {error && <div className="fin-error">{error}</div>}

      {!error && data && (
        <>
          {/* ========================================= */}
          {/* Top KPI row — three big cards             */}
          {/* ========================================= */}
          <section className="fin-kpi-row">
            <div className="fin-kpi fin-kpi-primary">
              <div className="fin-kpi-header">
                <span className="fin-kpi-label">Bank Balance</span>
                <span className="fin-kpi-icon fin-kpi-icon-primary">
                  <BankIcon />
                </span>
              </div>
              <div className="fin-kpi-value">
                {formatEuro(data.bankBalance.value)}
              </div>
              <div className="fin-kpi-hint">
                Income received {formatEuro(data.bankBalance.incomeReceived)} ·
                Ticket net {formatEuro(data.bankBalance.ticketNetRevenue)} ·
                Expenses paid {formatEuro(data.bankBalance.expensesPaid)}
              </div>
            </div>

            <div className="fin-kpi fin-kpi-amber">
              <div className="fin-kpi-header">
                <span className="fin-kpi-label">Remaining Commitments</span>
                <span className="fin-kpi-icon fin-kpi-icon-amber">
                  <CommitmentIcon />
                </span>
              </div>
              <div className="fin-kpi-value">
                {formatEuro(data.remainingCommitments.value)}
              </div>
              <div className="fin-kpi-hint">
                Outstanding expenses · {formatEuro(data.remainingCommitments.totalPaid)} of{" "}
                {formatEuro(data.remainingCommitments.totalExpenses)} already paid
              </div>
            </div>

            <div
              className={`fin-kpi ${
                data.fundingRequired.value > 0
                  ? "fin-kpi-danger"
                  : "fin-kpi-success"
              }`}
            >
              <div className="fin-kpi-header">
                <span className="fin-kpi-label">Funding Required</span>
                <span
                  className={`fin-kpi-icon ${
                    data.fundingRequired.value > 0
                      ? "fin-kpi-icon-danger"
                      : "fin-kpi-icon-success"
                  }`}
                >
                  {data.fundingRequired.value > 0 ? (
                    <AlertIcon />
                  ) : (
                    <CheckCircleIcon />
                  )}
                </span>
              </div>
              <div className="fin-kpi-value">
                {formatEuro(data.fundingRequired.value)}
              </div>
              <div className="fin-kpi-hint">{data.fundingRequired.reason}</div>
            </div>
          </section>

          {/* ========================================= */}
          {/* Two-column section: income vs expenses    */}
          {/* ========================================= */}
          <section className="fin-grid-2">
            {/* Income */}
            <div className="fin-card">
              <div className="fin-card-header">
                <div>
                  <h2 className="fin-card-title">Income</h2>
                  <p className="fin-card-subtitle">
                    Money expected and received
                  </p>
                </div>
                <Link
                  href="/super-admin/finance/income"
                  className="fin-card-link"
                >
                  Manage →
                </Link>
              </div>

              <div className="fin-stat-grid">
                <FinStat
                  label="Gross"
                  value={formatEuro(data.income.gross)}
                  tone="neutral"
                />
                <FinStat
                  label="Received"
                  value={formatEuro(data.income.received)}
                  tone="success"
                />
                <FinStat
                  label="Outstanding"
                  value={formatEuro(data.income.outstanding)}
                  tone="warn"
                />
              </div>
            </div>

            {/* Expenses */}
            <div className="fin-card">
              <div className="fin-card-header">
                <div>
                  <h2 className="fin-card-title">Expenses</h2>
                  <p className="fin-card-subtitle">
                    Money owed and paid
                  </p>
                </div>
                <Link
                  href="/super-admin/finance/expenses"
                  className="fin-card-link"
                >
                  Manage →
                </Link>
              </div>

              <div className="fin-stat-grid">
                <FinStat
                  label="Gross"
                  value={formatEuro(data.expenses.gross)}
                  tone="neutral"
                />
                <FinStat
                  label="Paid"
                  value={formatEuro(data.expenses.paid)}
                  tone="success"
                />
                <FinStat
                  label="Outstanding"
                  value={formatEuro(data.expenses.outstanding)}
                  tone="danger"
                />
              </div>
            </div>
          </section>

          {/* ========================================= */}
          {/* Ticket sales + payment method costs        */}
          {/* ========================================= */}
          <section className="fin-card">
            <div className="fin-card-header">
              <div>
                <h2 className="fin-card-title">Ticket Sales Performance</h2>
                <p className="fin-card-subtitle">
                  Gross revenue, fees, and net by payment channel
                </p>
              </div>
            </div>

            {/* Ticket totals summary */}
            <div className="fin-stat-grid fin-stat-grid-4">
              <FinStat
                label="Orders"
                value={String(data.tickets.orderCount)}
                tone="neutral"
              />
              <FinStat
                label="Gross Revenue"
                value={formatEuro(data.tickets.grossRevenue)}
                tone="primary"
              />
              <FinStat
                label="Fees"
                value={formatEuro(data.tickets.fees)}
                tone="danger"
              />
              <FinStat
                label="Net Revenue"
                value={formatEuro(data.tickets.netRevenue)}
                tone="success"
              />
            </div>

            {/* Per-channel breakdown */}
            <div className="fin-method-grid">
              <MethodCard
                label="Card / Stripe"
                stats={data.byMethod.card}
                tone="card"
              />
              <MethodCard
                label="ePassi"
                stats={data.byMethod.epassi}
                tone="epassi"
              />
              <MethodCard
                label="Edenred"
                stats={data.byMethod.edenred}
                tone="edenred"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ======================================================
// Sub-components
// ======================================================

function FinStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "primary" | "success" | "warn" | "danger";
}) {
  return (
    <div className={`fin-stat fin-stat-${tone}`}>
      <span className="fin-stat-label">{label}</span>
      <span className="fin-stat-value">{value}</span>
    </div>
  );
}

function MethodCard({
  label,
  stats,
  tone,
}: {
  label: string;
  stats: MethodStats;
  tone: "card" | "epassi" | "edenred";
}) {
  return (
    <div className={`fin-method fin-method-${tone}`}>
      <div className="fin-method-header">
        <span className="fin-method-label">{label}</span>
        <span className="fin-method-orders">
          {stats.orderCount} {stats.orderCount === 1 ? "order" : "orders"}
        </span>
      </div>
      <div className="fin-method-body">
        <div className="fin-method-row">
          <span className="fin-method-row-label">Gross</span>
          <span className="fin-method-row-value">
            {formatEuro(stats.grossRevenue)}
          </span>
        </div>
        <div className="fin-method-row">
          <span className="fin-method-row-label">Fees</span>
          <span className="fin-method-row-value fin-method-row-negative">
            −{formatEuro(stats.fees)}
          </span>
        </div>
        <div className="fin-method-row fin-method-row-total">
          <span className="fin-method-row-label">Net</span>
          <span className="fin-method-row-value">
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