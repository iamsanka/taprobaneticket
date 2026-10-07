"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "../Expenses.css";
import "../../income/[id]/Detail.css";
import "./Detail.css";

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

type PaymentMethod = "bank_transfer" | "cash" | "card" | "mobilepay" | "other";

type Payment = {
  id: number;
  expenseId: number;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

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
  payments: Payment[];
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

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
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

function statusLabel(status: ExpenseStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const expenseId = Number(id);

  const [expense, setExpense] = useState<Expense | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/expenses/${expenseId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setExpense(data.expense);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

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

  async function deletePayment(paymentId: number) {
    const ok = window.confirm(
      "Delete this payment? The expense balance will be recalculated."
    );
    if (!ok) return;

    try {
      const res = await fetch(
        `/api/super-admin/expenses/${expenseId}/payments/${paymentId}`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete payment");
        return;
      }
      load();
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  }

  async function deleteExpense() {
    const ok = window.confirm(
      `Permanently delete this expense and all its payments?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/super-admin/expenses/${expenseId}?confirm=delete`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete expense");
        return;
      }
      router.push("/super-admin/finance/expenses");
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
          <p className="fin-state-text">Loading expense…</p>
        </div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="fin-page">
        <Link href="/super-admin/finance/expenses" className="fin-back">
          <ArrowLeftIcon />
          Back to Expenses
        </Link>
        <div className="fin-error">{error || "Expense not found"}</div>
      </div>
    );
  }

  const progressPct =
    expense.grossAmount > 0
      ? Math.min((expense.paidAmount / expense.grossAmount) * 100, 100)
      : 0;

  const isOverdue =
    expense.dueDate &&
    expense.balanceAmount > 0 &&
    new Date(expense.dueDate) < new Date() &&
    expense.status !== "cancelled" &&
    expense.status !== "paid";

  return (
    <div className="fin-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/finance/expenses" className="fin-back">
        <ArrowLeftIcon />
        Back to Expenses
      </Link>

      {/* ---- Header ---- */}
      <header className="fin-detail-header">
        <div>
          <div className="fin-detail-eyebrow">
            <span className="fin-pill fin-pill-category">
              {CATEGORY_LABELS[expense.category]}
            </span>
            <span
              className={`fin-pill fin-pill-status-${expense.status}`}
            >
              {statusLabel(expense.status)}
            </span>
            {isOverdue && (
              <span className="fin-td-overdue-tag">Overdue</span>
            )}
          </div>
          <h1 className="fin-detail-title">
            {expense.supplier ?? expense.title}
          </h1>
          <p className="fin-detail-subtitle">
            {expense.supplier ? expense.title : null}
            {expense.eventTitle && (
              <>
                {expense.supplier ? " · " : ""}
                <strong>Event:</strong> {expense.eventTitle}
              </>
            )}
            {!expense.eventTitle && (
              <>
                {expense.supplier ? " · " : ""}
                <em>Company-wide expense</em>
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
            onClick={deleteExpense}
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
            {formatEuro(expense.grossAmount)}
          </span>
        </div>
        <div className="fin-detail-kpi fin-detail-kpi-success">
          <span className="fin-detail-kpi-label">Paid</span>
          <span className="fin-detail-kpi-value">
            {formatEuro(expense.paidAmount)}
          </span>
        </div>
        <div
          className={`fin-detail-kpi ${
            expense.balanceAmount > 0 ? "fin-detail-kpi-warn" : ""
          }`}
        >
          <span className="fin-detail-kpi-label">Balance</span>
          <span className="fin-detail-kpi-value">
            {formatEuro(expense.balanceAmount)}
          </span>
        </div>
      </section>

      {/* ---- Progress bar ---- */}
      <div className="fin-detail-progress-wrap">
        <div className="fin-detail-progress-meta">
          <span>Payment progress</span>
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

      {/* ---- Details + notes ---- */}
      <section className="fin-detail-grid">
        <div className="fin-detail-card">
          <h2 className="fin-detail-card-title">Details</h2>
          <dl className="fin-detail-dl">
            <div>
              <dt>Category</dt>
              <dd>{CATEGORY_LABELS[expense.category]}</dd>
            </div>
            {expense.subCategory && (
              <div>
                <dt>Sub-category</dt>
                <dd>{expense.subCategory}</dd>
              </div>
            )}
            <div>
              <dt>Supplier</dt>
              <dd>{expense.supplier ?? "—"}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{expense.eventTitle ?? "Company-wide"}</dd>
            </div>
            <div>
              <dt>Issue date</dt>
              <dd>{formatDate(expense.issueDate)}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd
                className={isOverdue ? "fin-detail-overdue" : undefined}
              >
                {formatDate(expense.dueDate)}
                {isOverdue && (
                  <span className="fin-td-overdue-tag">Overdue</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(expense.createdAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDateTime(expense.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="fin-detail-card">
          <h2 className="fin-detail-card-title">Notes</h2>
          {expense.description && (
            <p className="fin-detail-text">{expense.description}</p>
          )}
          {expense.notes && (
            <>
              <h3 className="fin-detail-subhead">Internal notes</h3>
              <p className="fin-detail-text fin-detail-text-muted">
                {expense.notes}
              </p>
            </>
          )}
          {!expense.description && !expense.notes && (
            <p className="fin-detail-text fin-detail-text-muted">
              No notes recorded.
            </p>
          )}
        </div>
      </section>

      {/* ---- Payments ---- */}
      <section className="fin-detail-card fin-detail-card-full">
        <div className="fin-detail-card-header">
          <div>
            <h2 className="fin-detail-card-title">
              Payments ({expense.payments.length})
            </h2>
            <p className="fin-detail-card-subtitle">
              Each payment recorded against this expense
            </p>
          </div>
          <button
            className="fin-add-btn"
            onClick={() => setShowAddPayment(true)}
            disabled={expense.status === "cancelled"}
          >
            <PlusIcon />
            Add Payment
          </button>
        </div>

        {expense.payments.length === 0 ? (
          <div className="fin-detail-empty">
            <p>No payments recorded yet.</p>
            <p className="fin-detail-text-muted">
              Add the first payment when money leaves.
            </p>
          </div>
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Paid on</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Notes</th>
                  <th className="fin-td-right">Amount</th>
                  <th className="fin-td-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expense.payments
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.paidAt).getTime() -
                      new Date(a.paidAt).getTime()
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paidAt)}</td>
                      <td>
                        <span className="fin-pill fin-pill-category">
                          {PAYMENT_METHOD_LABELS[p.method]}
                        </span>
                      </td>
                      <td className="fin-td-muted">{p.reference ?? "—"}</td>
                      <td className="fin-td-muted">{p.notes ?? "—"}</td>
                      <td className="fin-td-right fin-td-strong">
                        {formatEuro(p.amount)}
                      </td>
                      <td className="fin-td-right">
                        <button
                          className="fin-icon-btn fin-icon-btn-danger"
                          onClick={() => deletePayment(p.id)}
                          title="Delete payment"
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

      {/* ---- Add payment modal ---- */}
      {showAddPayment && (
        <AddPaymentModal
          expenseId={expenseId}
          balanceAmount={expense.balanceAmount}
          onClose={() => setShowAddPayment(false)}
          onAdded={() => {
            setShowAddPayment(false);
            load();
          }}
        />
      )}

      {/* ---- Edit expense modal ---- */}
      {showEdit && (
        <EditExpenseModal
          expense={expense}
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
// Add payment modal
// ======================================================

function AddPaymentModal({
  expenseId,
  balanceAmount,
  onClose,
  onAdded,
}: {
  expenseId: number;
  balanceAmount: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [amountEuro, setAmountEuro] = useState(
    balanceAmount > 0 ? (balanceAmount / 100).toFixed(2) : ""
  );
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
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
        `/api/super-admin/expenses/${expenseId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amount: cents,
            method,
            paidAt,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to add payment");
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
          <h2 className="fin-modal-title">Add Payment</h2>
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
              <span className="fin-field-label">Paid on</span>
              <input
                type="date"
                className="fin-input"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </label>
          </div>

          <label className="fin-field">
            <span className="fin-field-label">Method</span>
            <select
              className="fin-input"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as PaymentMethod)
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
              placeholder="Payment ref / bank ref / receipt #"
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
              {saving ? "Adding…" : "Add Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================================================
// Edit expense modal
// ======================================================

function EditExpenseModal({
  expense,
  events,
  onClose,
  onSaved,
}: {
  expense: Expense;
  events: EventOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(expense.category);
  const [title, setTitle] = useState(expense.title);
  const [description, setDescription] = useState(expense.description ?? "");
  const [supplier, setSupplier] = useState(expense.supplier ?? "");
  const [subCategory, setSubCategory] = useState(expense.subCategory ?? "");
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [eventId, setEventId] = useState(
    expense.eventId ? String(expense.eventId) : ""
  );
  const [grossEuro, setGrossEuro] = useState(
    (expense.grossAmount / 100).toFixed(2)
  );
  const [issueDate, setIssueDate] = useState(
    expense.issueDate ? expense.issueDate.slice(0, 10) : ""
  );
  const [dueDate, setDueDate] = useState(
    expense.dueDate ? expense.dueDate.slice(0, 10) : ""
  );
  const [status, setStatus] = useState<ExpenseStatus>(expense.status);
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
      const res = await fetch(
        `/api/super-admin/expenses/${expense.id}`,
        {
          method: "PATCH",
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
        }
      );
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
          <h2 className="fin-modal-title">Edit Expense</h2>
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
                <option value="quote">Quote</option>
                <option value="booked">Booked</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <span className="fin-field-hint">
                "Partial" is computed from payments and can't be set directly.
              </span>
            </label>
          </div>

          <div className="fin-field-row">
            <label className="fin-field">
              <span className="fin-field-label">Supplier</span>
              <input
                type="text"
                className="fin-input"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
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
                maxLength={128}
              />
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