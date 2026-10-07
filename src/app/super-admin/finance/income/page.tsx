"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "../Finance.css";
import "./Income.css";

type IncomeCategory =
  | "director_share"
  | "sponsorship"
  | "donation"
  | "bank_transfer"
  | "other";

type IncomeStatus = "expected" | "partial" | "received" | "cancelled";

type Income = {
  id: number;
  eventId: number | null;
  eventTitle: string | null;
  category: IncomeCategory;
  title: string;
  description: string | null;
  payer: string | null;
  grossAmount: number;
  status: IncomeStatus;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  receivedAmount: number;
  balanceAmount: number;
};

type Summary = {
  count: number;
  activeCount: number;
  totalGross: number;
  totalReceived: number;
  totalOutstanding: number;
};

type EventOption = { id: number; title: string };

const CATEGORY_LABELS: Record<IncomeCategory, string> = {
  director_share: "Director Share",
  sponsorship: "Sponsorship",
  donation: "Donation",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "expected", label: "Expected" },
  { value: "partial", label: "Partial" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "director_share", label: "Director Share" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "donation", label: "Donation" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

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

export default function IncomeListPage() {
  const router = useRouter();

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal
  const [showCreate, setShowCreate] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (eventFilter !== "all") p.set("eventId", eventFilter);
    if (categoryFilter !== "all") p.set("category", categoryFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    return p.toString();
  }, [eventFilter, categoryFilter, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/incomes${queryString ? "?" + queryString : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setIncomes(data.incomes ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // Fetch events for the filter dropdown (once)
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/super-admin/events/list", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        setEvents(data.events ?? []);
      } catch (err) {
        console.error("Failed to load events:", err);
      }
    }
    loadEvents();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <div className="fin-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/finance" className="fin-back">
        <ArrowLeftIcon />
        Back to Finance
      </Link>

      {/* ---- Header ---- */}
      <header className="fin-header">
        <div>
          <h1 className="fin-title">Income</h1>
          <p className="fin-subtitle">
            Track expected, partial, and received income
          </p>
        </div>
        <button
          className="fin-add-btn"
          onClick={() => setShowCreate(true)}
        >
          <PlusIcon />
          Add Income
        </button>
      </header>

      {/* ---- Summary tiles ---- */}
      {summary && (
        <section className="fin-stat-grid" style={{ marginBottom: 20 }}>
          <div className="fin-stat">
            <span className="fin-stat-label">Total Gross</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalGross)}
            </span>
          </div>
          <div className="fin-stat fin-stat-success">
            <span className="fin-stat-label">Received</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalReceived)}
            </span>
          </div>
          <div className="fin-stat fin-stat-warn">
            <span className="fin-stat-label">Outstanding</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalOutstanding)}
            </span>
          </div>
        </section>
      )}

      {/* ---- Filters ---- */}
      <section className="fin-filters">
        <div className="fin-filter">
          <label className="fin-filter-label">Event</label>
          <select
            className="fin-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">All events</option>
            <option value="none">Company-wide only</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>

        <div className="fin-filter">
          <label className="fin-filter-label">Category</label>
          <select
            className="fin-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="fin-filter">
          <label className="fin-filter-label">Status</label>
          <select
            className="fin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="fin-filter fin-filter-actions">
          <button
            className="fin-reset-btn"
            onClick={() => {
              setEventFilter("all");
              setCategoryFilter("all");
              setStatusFilter("all");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {loading && (
        <div className="fin-state">
          <div className="fin-state-spinner" />
          <p className="fin-state-text">Loading incomes…</p>
        </div>
      )}

      {error && <div className="fin-error">{error}</div>}

      {!loading && !error && incomes.length === 0 && (
        <div className="fin-state">
          <p className="fin-state-text">
            No income records match these filters.
          </p>
          <button
            className="fin-add-btn"
            style={{ marginTop: 16 }}
            onClick={() => setShowCreate(true)}
          >
            <PlusIcon />
            Add your first income
          </button>
        </div>
      )}

      {!loading && !error && incomes.length > 0 && (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Category</th>
                <th>Event</th>
                <th className="fin-td-right">Gross</th>
                <th className="fin-td-right">Received</th>
                <th className="fin-td-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {incomes.map((i) => (
                <tr
                  key={i.id}
                  onClick={() =>
                    router.push(`/super-admin/finance/income/${i.id}`)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td className="fin-td-muted">
                    {formatDate(i.createdAt)}
                  </td>
                  <td>
                    <div className="fin-td-strong">{i.title}</div>
                    {i.payer && (
                      <div className="fin-td-sub">{i.payer}</div>
                    )}
                  </td>
                  <td>
                    <span className="fin-pill fin-pill-category">
                      {CATEGORY_LABELS[i.category]}
                    </span>
                  </td>
                  <td className="fin-td-muted">
                    {i.eventTitle ?? "Company-wide"}
                  </td>
                  <td className="fin-td-right fin-td-strong">
                    {formatEuro(i.grossAmount)}
                  </td>
                  <td className="fin-td-right">
                    {formatEuro(i.receivedAmount)}
                  </td>
                  <td className="fin-td-right">
                    <span
                      className={
                        i.balanceAmount > 0
                          ? "fin-td-balance-positive"
                          : "fin-td-balance-zero"
                      }
                    >
                      {formatEuro(i.balanceAmount)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`fin-pill fin-pill-status-${i.status}`}
                    >
                      {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Create modal ---- */}
      {showCreate && (
        <CreateIncomeModal
          events={events}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ======================================================
// Create modal
// ======================================================

function CreateIncomeModal({
  events,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<IncomeCategory>("director_share");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [grossEuro, setGrossEuro] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    const grossCents = Math.round(Number(grossEuro) * 100);
    if (!Number.isFinite(grossCents) || grossCents <= 0) {
      setError("Enter a positive amount");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/incomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          title: trimmedTitle,
          description: description.trim() || null,
          payer: payer.trim() || null,
          notes: notes.trim() || null,
          eventId: eventId ? Number(eventId) : null,
          grossAmount: grossCents,
          dueDate: dueDate || null,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to create income");
        return;
      }

      onCreated();
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fin-modal-overlay"
      onClick={() => !saving && onClose()}
    >
      <div
        className="fin-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fin-modal-header">
          <h2 className="fin-modal-title">Add Income</h2>
          <button
            className="fin-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="fin-modal-body">
          {error && <div className="fin-modal-error">{error}</div>}

          <label className="fin-field">
            <span className="fin-field-label">
              Category <span className="fin-required">*</span>
            </span>
            <select
              className="fin-input"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as IncomeCategory)
              }
            >
              <option value="director_share">Director Share</option>
              <option value="sponsorship">Sponsorship</option>
              <option value="donation">Donation</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="fin-field">
            <span className="fin-field-label">
              Title <span className="fin-required">*</span>
            </span>
            <input
              type="text"
              className="fin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Director Share — April"
              autoFocus
              maxLength={255}
            />
          </label>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">Amount (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="fin-input"
                value={grossEuro}
                onChange={(e) => setGrossEuro(e.target.value)}
                placeholder="5000.00"
              />
            </label>

            <label className="fin-field">
              <span className="fin-field-label">Due date (optional)</span>
              <input
                type="date"
                className="fin-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>

          <label className="fin-field">
            <span className="fin-field-label">Payer / Source</span>
            <input
              type="text"
              className="fin-input"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              placeholder="e.g. Tharuka Chamara"
              maxLength={255}
            />
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Event (optional)</span>
            <select
              className="fin-input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Company-wide (no event)</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Description (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this income for?"
            />
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Internal notes (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes only visible to the team"
            />
          </label>

          <div className="fin-modal-actions">
            <button
              type="button"
              className="fin-btn fin-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fin-btn fin-btn-primary"
              disabled={saving}
            >
              {saving ? "Creating…" : "Create Income"}
            </button>
          </div>
        </form>
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}