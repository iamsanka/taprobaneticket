"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "../Income.css";
import "./Detail.css";

type IncomeCategory =
  | "director_share"
  | "sponsorship"
  | "donation"
  | "bank_transfer"
  | "other";

type IncomeStatus = "expected" | "partial" | "received" | "cancelled";

type ReceiptMethod = "bank_transfer" | "cash" | "card" | "mobilepay" | "other";

type Receipt = {
  id: number;
  incomeId: number;
  amount: number;
  receivedAt: string;
  method: ReceiptMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

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
  updatedAt: string;
  receivedAmount: number;
  balanceAmount: number;
  receipts: Receipt[];
};

type EventOption = { id: number; title: string };

const CATEGORY_LABELS: Record<IncomeCategory, string> = {
  director_share: "Director Share",
  sponsorship: "Sponsorship",
  donation: "Donation",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

const RECEIPT_METHOD_LABELS: Record<ReceiptMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  mobilepay: "MobilePay",
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: IncomeStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function IncomeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const incomeId = Number(id);

  const [income, setIncome] = useState<Income | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/incomes/${incomeId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setIncome(data.income);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [incomeId]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function deleteReceipt(receiptId: number) {
    const ok = window.confirm(
      "Delete this receipt? The income balance will be recalculated."
    );
    if (!ok) return;

    try {
      const res = await fetch(
        `/api/super-admin/incomes/${incomeId}/receipts/${receiptId}`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete receipt");
        return;
      }
      load();
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  }

  async function deleteIncome() {
    const ok = window.confirm(
      `Permanently delete this income and all its receipts?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/super-admin/incomes/${incomeId}?confirm=delete`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete income");
        return;
      }
      router.push("/super-admin/finance/income");
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="fin-page">
        <div className="fin-state">
          <div className="fin-state-spinner" />
          <p className="fin-state-text">Loading income…</p>
        </div>
      </div>
    );
  }

  if (error || !income) {
    return (
      <div className="fin-page">
        <Link href="/super-admin/finance/income" className="fin-back">
          <ArrowLeftIcon />
          Back to Income
        </Link>
        <div className="fin-error">{error || "Income not found"}</div>
      </div>
    );
  }

  const progressPct =
    income.grossAmount > 0
      ? Math.min((income.receivedAmount / income.grossAmount) * 100, 100)
      : 0;

  return (
    <div className="fin-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/finance/income" className="fin-back">
        <ArrowLeftIcon />
        Back to Income
      </Link>

      {/* ---- Header ---- */}
      <header className="fin-detail-header">
        <div>
          <div className="fin-detail-eyebrow">
            <span className="fin-pill fin-pill-category">
              {CATEGORY_LABELS[income.category]}
            </span>
            <span className={`fin-pill fin-pill-status-${income.status}`}>
              {statusLabel(income.status)}
            </span>
          </div>
          <h1 className="fin-detail-title">{income.title}</h1>
          <p className="fin-detail-subtitle">
            {income.eventTitle ? (
              <>
                <strong>Event:</strong> {income.eventTitle}
              </>
            ) : (
              <em>Company-wide income</em>
            )}
            {income.payer && (
              <>
                {" · "}
                <strong>From:</strong> {income.payer}
              </>
            )}
          </p>
        </div>
        <div className="fin-detail-actions">
          <button
            className="fin-btn fin-btn-ghost"
            onClick={() => setShowEdit(true)}
          >
            <EditIcon />
            Edit
          </button>
          <button
            className="fin-btn fin-btn-danger-outline"
            onClick={deleteIncome}
            disabled={deleting}
          >
            <TrashIcon />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </header>

      {/* ---- KPI row ---- */}
      <section className="fin-detail-kpi-row">
        <div className="fin-detail-kpi">
          <span className="fin-detail-kpi-label">Gross</span>
          <span className="fin-detail-kpi-value">
            {formatEuro(income.grossAmount)}
          </span>
        </div>
        <div className="fin-detail-kpi fin-detail-kpi-success">
          <span className="fin-detail-kpi-label">Received</span>
          <span className="fin-detail-kpi-value">
            {formatEuro(income.receivedAmount)}
          </span>
        </div>
        <div className="fin-detail-kpi fin-detail-kpi-warn">
          <span className="fin-detail-kpi-label">Balance</span>
          <span className="fin-detail-kpi-value">
            {formatEuro(income.balanceAmount)}
          </span>
        </div>
      </section>

      {/* ---- Progress bar ---- */}
      <div className="fin-detail-progress-wrap">
        <div className="fin-detail-progress-meta">
          <span>Collection progress</span>
          <span className="fin-detail-progress-pct">
            {progressPct.toFixed(0)}%
          </span>
        </div>
        <div className="fin-detail-progress-track">
          <span
            className="fin-detail-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ---- Details + meta ---- */}
      <section className="fin-detail-grid">
        <div className="fin-detail-card">
          <h2 className="fin-detail-card-title">Details</h2>
          <dl className="fin-detail-dl">
            <div>
              <dt>Category</dt>
              <dd>{CATEGORY_LABELS[income.category]}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{income.eventTitle ?? "Company-wide"}</dd>
            </div>
            <div>
              <dt>Payer / Source</dt>
              <dd>{income.payer ?? "—"}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{formatDate(income.dueDate)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(income.createdAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateTime(income.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="fin-detail-card">
          <h2 className="fin-detail-card-title">Notes</h2>
          {income.description && (
            <p className="fin-detail-text">{income.description}</p>
          )}
          {income.notes && (
            <>
              <h3 className="fin-detail-subhead">Internal notes</h3>
              <p className="fin-detail-text fin-detail-text-muted">
                {income.notes}
              </p>
            </>
          )}
          {!income.description && !income.notes && (
            <p className="fin-detail-text fin-detail-text-muted">
              No notes recorded.
            </p>
          )}
        </div>
      </section>

      {/* ---- Receipts ---- */}
      <section className="fin-detail-card fin-detail-card-full">
        <div className="fin-detail-card-header">
          <div>
            <h2 className="fin-detail-card-title">
              Receipts ({income.receipts.length})
            </h2>
            <p className="fin-detail-card-subtitle">
              Each partial payment recorded against this income
            </p>
          </div>
          <button
            className="fin-add-btn"
            onClick={() => setShowAddReceipt(true)}
            disabled={income.status === "cancelled"}
          >
            <PlusIcon />
            Add Receipt
          </button>
        </div>

        {income.receipts.length === 0 ? (
          <div className="fin-detail-empty">
            <p>No receipts recorded yet.</p>
            <p className="fin-detail-text-muted">
              Add the first receipt when money arrives.
            </p>
          </div>
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Notes</th>
                  <th className="fin-td-right">Amount</th>
                  <th className="fin-td-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {income.receipts
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.receivedAt).getTime() -
                      new Date(a.receivedAt).getTime()
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.receivedAt)}</td>
                      <td>
                        <span className="fin-pill fin-pill-category">
                          {RECEIPT_METHOD_LABELS[r.method]}
                        </span>
                      </td>
                      <td className="fin-td-muted">{r.reference ?? "—"}</td>
                      <td className="fin-td-muted">{r.notes ?? "—"}</td>
                      <td className="fin-td-right fin-td-strong">
                        {formatEuro(r.amount)}
                      </td>
                      <td className="fin-td-right">
                        <button
                          className="fin-icon-btn fin-icon-btn-danger"
                          onClick={() => deleteReceipt(r.id)}
                          title="Delete receipt"
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Add receipt modal ---- */}
      {showAddReceipt && (
        <AddReceiptModal
          incomeId={incomeId}
          balanceAmount={income.balanceAmount}
          onClose={() => setShowAddReceipt(false)}
          onAdded={() => {
            setShowAddReceipt(false);
            load();
          }}
        />
      )}

      {/* ---- Edit income modal ---- */}
      {showEdit && (
        <EditIncomeModal
          income={income}
          events={events}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ======================================================
// Add receipt modal
// ======================================================

function AddReceiptModal({
  incomeId,
  balanceAmount,
  onClose,
  onAdded,
}: {
  incomeId: number;
  balanceAmount: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [amountEuro, setAmountEuro] = useState(
    balanceAmount > 0 ? (balanceAmount / 100).toFixed(2) : ""
  );
  const [method, setMethod] = useState<ReceiptMethod>("bank_transfer");
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cents = Math.round(Number(amountEuro) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Enter a positive amount");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/super-admin/incomes/${incomeId}/receipts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amount: cents,
            method,
            receivedAt,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to add receipt");
        return;
      }
      onAdded();
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
          <h2 className="fin-modal-title">Add Receipt</h2>
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
                Amount (€) <span className="fin-required">*</span>
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="fin-input"
                value={amountEuro}
                onChange={(e) => setAmountEuro(e.target.value)}
                autoFocus
              />
            </label>

            <label className="fin-field">
              <span className="fin-field-label">Received on</span>
              <input
                type="date"
                className="fin-input"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </label>
          </div>

          <label className="fin-field">
            <span className="fin-field-label">Method</span>
            <select
              className="fin-input"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as ReceiptMethod)
              }
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobilepay">MobilePay</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Reference (optional)</span>
            <input
              type="text"
              className="fin-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice ref / bank ref / receipt #"
              maxLength={255}
            />
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Notes (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any internal remarks"
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
              {saving ? "Adding…" : "Add Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================================================
// Edit income modal
// ======================================================

function EditIncomeModal({
  income,
  events,
  onClose,
  onSaved,
}: {
  income: Income;
  events: EventOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(income.category);
  const [title, setTitle] = useState(income.title);
  const [description, setDescription] = useState(income.description ?? "");
  const [payer, setPayer] = useState(income.payer ?? "");
  const [notes, setNotes] = useState(income.notes ?? "");
  const [eventId, setEventId] = useState(
    income.eventId ? String(income.eventId) : ""
  );
  const [grossEuro, setGrossEuro] = useState(
    (income.grossAmount / 100).toFixed(2)
  );
  const [dueDate, setDueDate] = useState(
    income.dueDate ? income.dueDate.slice(0, 10) : ""
  );
  const [status, setStatus] = useState(income.status);
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
      const res = await fetch(`/api/super-admin/incomes/${income.id}`, {
        method: "PATCH",
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
          status,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to save");
        return;
      }
      onSaved();
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
          <h2 className="fin-modal-title">Edit Income</h2>
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
              Title <span className="fin-required">*</span>
            </span>
            <input
              type="text"
              className="fin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
            />
          </label>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">Category</span>
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
              <span className="fin-field-label">Status</span>
              <select
                className="fin-input"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as IncomeStatus)
                }
              >
                <option value="expected">Expected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

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
            />
          </label>

          <label className="fin-field">
            <span className="fin-field-label">Internal notes (optional)</span>
            <textarea
              className="fin-input fin-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
              {saving ? "Saving…" : "Save Changes"}
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

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}