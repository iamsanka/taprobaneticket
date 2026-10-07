"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "../Finance.css";
import "../income/Income.css";
import "./Expenses.css";

type ExpenseCategory =
  | "artists_crew"
  | "production_equipment"
  | "event_venue"
  | "marketing"
  | "operations"
  | "admin"
  | "travel"
  | "catering"
  | "other";

type ExpenseStatus = "quote" | "booked" | "partial" | "paid" | "cancelled";

type Expense = {
  id: number;
  eventId: number | null;
  eventTitle: string | null;
  category: ExpenseCategory;
  title: string;
  description: string | null;
  supplier: string | null;
  subCategory: string | null;
  grossAmount: number;
  status: ExpenseStatus;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  paidAmount: number;
  balanceAmount: number;
};

type Summary = {
  count: number;
  activeCount: number;
  totalGross: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
};

type EventOption = { id: number; title: string };

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
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

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "quote", label: "Quote" },
  { value: "booked", label: "Booked" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "artists_crew", label: "Artists & Crew" },
  { value: "production_equipment", label: "Production & Equipment" },
  { value: "event_venue", label: "Event & Venue" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations" },
  { value: "admin", label: "Admin" },
  { value: "travel", label: "Travel" },
  { value: "catering", label: "Catering" },
  { value: "other", label: "Other" },
];

const ON_CREATE_STATUS_OPTIONS: { value: ExpenseStatus; label: string }[] = [
  { value: "quote", label: "Quote (not yet committed)" },
  { value: "booked", label: "Booked (committed, not paid)" },
  { value: "paid", label: "Paid (already paid)" },
  { value: "cancelled", label: "Cancelled (called off)" },
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

function statusLabel(status: ExpenseStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ExpensesListPage() {
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Modal
  const [showCreate, setShowCreate] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (eventFilter !== "all") p.set("eventId", eventFilter);
    if (categoryFilter !== "all") p.set("category", categoryFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [eventFilter, categoryFilter, statusFilter, search]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/expenses${queryString ? "?" + queryString : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setExpenses(data.expenses ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // Load events once for the filter dropdown
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

  // Debounce search slightly
  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(t);
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
          <h1 className="fin-title">Expenses</h1>
          <p className="fin-subtitle">
            Track quotes, bookings, and paid bills
          </p>
        </div>
        <button
          className="fin-add-btn"
          onClick={() => setShowCreate(true)}
        >
          <PlusIcon />
          Add Expense
        </button>
      </header>

      {/* ---- Summary tiles ---- */}
      {summary && (
        <section className="fin-stat-grid fin-stat-grid-4" style={{ marginBottom: 20 }}>
          <div className="fin-stat">
            <span className="fin-stat-label">Total Gross</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalGross)}
            </span>
          </div>
          <div className="fin-stat fin-stat-success">
            <span className="fin-stat-label">Paid</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalPaid)}
            </span>
          </div>
          <div className="fin-stat fin-stat-danger">
            <span className="fin-stat-label">Outstanding</span>
            <span className="fin-stat-value">
              {formatEuro(summary.totalOutstanding)}
            </span>
          </div>
          <div
            className={`fin-stat ${
              summary.overdueCount > 0 ? "fin-stat-warn" : ""
            }`}
          >
            <span className="fin-stat-label">Overdue</span>
            <span className="fin-stat-value">
              {summary.overdueCount}{" "}
              {summary.overdueCount === 1 ? "bill" : "bills"}
            </span>
          </div>
        </section>
      )}

      {/* ---- Filters ---- */}
      <section className="fin-filters">
        <div className="fin-filter">
          <label className="fin-filter-label">Search</label>
          <input
            type="text"
            className="fin-select fin-select-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Supplier, title, sub-category…"
          />
        </div>

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
              setSearch("");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {loading && (
        <div className="fin-state">
          <div className="fin-state-spinner" />
          <p className="fin-state-text">Loading expenses…</p>
        </div>
      )}

      {error && <div className="fin-error">{error}</div>}

      {!loading && !error && expenses.length === 0 && (
        <div className="fin-state">
          <p className="fin-state-text">
            No expense records match these filters.
          </p>
          <button
            className="fin-add-btn"
            style={{ marginTop: 16 }}
            onClick={() => setShowCreate(true)}
          >
            <PlusIcon />
            Add your first expense
          </button>
        </div>
      )}

      {!loading && !error && expenses.length > 0 && (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Supplier / Expense</th>
                <th>Category</th>
                <th>Event</th>
                <th>Due</th>
                <th className="fin-td-right">Gross</th>
                <th className="fin-td-right">Paid</th>
                <th className="fin-td-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const overdue =
                  e.dueDate &&
                  e.balanceAmount > 0 &&
                  new Date(e.dueDate) < new Date() &&
                  e.status !== "cancelled";

                return (
                  <tr
                    key={e.id}
                    onClick={() =>
                      router.push(`/super-admin/finance/expenses/${e.id}`)
                    }
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <div className="fin-td-strong">
                        {e.supplier ?? e.title}
                      </div>
                      <div className="fin-td-sub">
                        {e.supplier ? e.title : null}
                        {e.subCategory ? (
                          <>
                            {e.supplier ? " · " : ""}
                            {e.subCategory}
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="fin-pill fin-pill-category">
                        {CATEGORY_LABELS[e.category]}
                      </span>
                    </td>
                    <td className="fin-td-muted">
                      {e.eventTitle ?? "Company-wide"}
                    </td>
                    <td className={overdue ? "fin-td-overdue" : "fin-td-muted"}>
                      {formatDate(e.dueDate)}
                      {overdue && (
                        <span className="fin-td-overdue-tag">overdue</span>
                      )}
                    </td>
                    <td className="fin-td-right fin-td-strong">
                      {formatEuro(e.grossAmount)}
                    </td>
                    <td className="fin-td-right">
                      {formatEuro(e.paidAmount)}
                    </td>
                    <td className="fin-td-right">
                      <span
                        className={
                          e.balanceAmount > 0
                            ? "fin-td-balance-positive"
                            : "fin-td-balance-zero"
                        }
                      >
                        {formatEuro(e.balanceAmount)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`fin-pill fin-pill-status-${e.status}`}
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

      {/* ---- Create modal ---- */}
      {showCreate && (
        <CreateExpenseModal
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

function CreateExpenseModal({
  events,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>("operations");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [grossEuro, setGrossEuro] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("booked");
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
      const res = await fetch("/api/super-admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          title: trimmedTitle,
          description: description.trim() || null,
          supplier: supplier.trim() || null,
          subCategory: subCategory.trim() || null,
          notes: notes.trim() || null,
          eventId: eventId ? Number(eventId) : null,
          grossAmount: grossCents,
          issueDate: issueDate || null,
          dueDate: dueDate || null,
          status,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to create expense");
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
        className="fin-modal fin-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fin-modal-header">
          <h2 className="fin-modal-title">Add Expense</h2>
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

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">
                Category <span className="fin-required">*</span>
              </span>
              <select
                className="fin-input"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ExpenseCategory)
                }
              >
                <option value="artists_crew">Artists & Crew</option>
                <option value="production_equipment">
                  Production & Equipment
                </option>
                <option value="event_venue">Event & Venue</option>
                <option value="marketing">Marketing</option>
                <option value="operations">Operations</option>
                <option value="admin">Admin</option>
                <option value="travel">Travel</option>
                <option value="catering">Catering</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="fin-field">
              <span className="fin-field-label">Status</span>
              <select
                className="fin-input"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ExpenseStatus)
                }
              >
                {ON_CREATE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="fin-field">
            <span className="fin-field-label">
              Title <span className="fin-required">*</span>
            </span>
            <input
              type="text"
              className="fin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Venue rental — main hall"
              autoFocus
              maxLength={255}
            />
          </label>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">Supplier</span>
              <input
                type="text"
                className="fin-input"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Nordea Bank"
                maxLength={255}
              />
            </label>

            <label className="fin-field">
              <span className="fin-field-label">Sub-category</span>
              <input
                type="text"
                className="fin-input"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                placeholder="e.g. Mobile / telecom"
                maxLength={128}
              />
            </label>
          </div>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">
                Amount (€) <span className="fin-required">*</span>
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="fin-input"
                value={grossEuro}
                onChange={(e) => setGrossEuro(e.target.value)}
                placeholder="2710.00"
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
          </div>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">Issue date</span>
              <input
                type="date"
                className="fin-input"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </label>

            <label className="fin-field">
              <span className="fin-field-label">Due date</span>
              <input
                type="date"
                className="fin-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>

          <label className="fin-field">
            <span className="fin-field-label">Description (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this expense for?"
            />
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Internal notes (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Remarks only visible to the team"
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
              {saving ? "Creating…" : "Create Expense"}
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