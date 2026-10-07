"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./create.css";

type TicketType = {
  id: string; // local-only key for React
  name: string;
};

const MAX_TYPES = 5;

function generateKey() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CreateCategoryPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "" });
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([
    { id: generateKey(), name: "" },
  ]);

  function addTicketType() {
    if (ticketTypes.length >= MAX_TYPES) {
      setError(`Maximum ${MAX_TYPES} ticket types allowed.`);
      return;
    }
    setError(null);
    setTicketTypes((prev) => [...prev, { id: generateKey(), name: "" }]);
  }

  function updateTicketType(id: string, value: string) {
    setTicketTypes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: value } : t))
    );
    if (error) setError(null);
  }

  function removeTicketType(id: string) {
    setTicketTypes((prev) => prev.filter((t) => t.id !== id));
    if (error) setError(null);
  }

  // Live validity check for the preview and submit button
  const filledTypes = useMemo(
    () => ticketTypes.filter((t) => t.name.trim()),
    [ticketTypes]
  );
  const canSubmit = form.name.trim().length > 0 && filledTypes.length > 0;

  async function submit() {
    setError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Please enter a category name.");
      return;
    }

    if (ticketTypes.length === 0) {
      setError("Please add at least one ticket type.");
      return;
    }

    // Check no empty names in the list (only count rows the user left in)
    const hasEmpty = ticketTypes.some((t) => !t.name.trim());
    if (hasEmpty) {
      setError("Every ticket type needs a name, or remove the empty rows.");
      return;
    }

    // Check for duplicates (case-insensitive)
    const seen = new Set<string>();
    for (const t of ticketTypes) {
      const key = t.name.trim().toLowerCase();
      if (seen.has(key)) {
        setError(`Duplicate ticket type: "${t.name.trim()}"`);
        return;
      }
      seen.add(key);
    }

    setSaving(true);

    try {
      const res = await fetch("/api/super-admin/ticket-categories/create", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          ticketTypesList: ticketTypes.map((t) => ({
            name: t.name.trim(),
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/super-admin/ticket-categories");
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cat-page">
      {/* ---- Back ---- */}
      <Link
        href="/super-admin/ticket-categories"
        className="cat-back"
      >
        <ArrowLeftIcon />
        Back to Categories
      </Link>

      {/* ---- Header ---- */}
      <header className="cat-header">
        <div>
          <h1 className="cat-title">Create Ticket Category</h1>
          <p className="cat-subtitle">
            Define a category (Lounge, Standard, VIP…) and the ticket types
            inside it
          </p>
        </div>
      </header>

      <div className="cat-layout">
        {/* ============================================ */}
        {/* Main column                                   */}
        {/* ============================================ */}
        <div className="cat-main">
          {/* ---- STEP 1: Category name ---- */}
          <section className="cat-card">
            <div className="cat-card-header">
              <span className="cat-step">1</span>
              <div>
                <h2 className="cat-card-title">Category</h2>
                <p className="cat-card-subtitle">
                  A short label that groups ticket types together
                </p>
              </div>
            </div>

            <div className="cat-field">
              <label className="cat-label" htmlFor="cat-name">
                Category Name <span className="cat-required">*</span>
              </label>
              <input
                id="cat-name"
                type="text"
                className="cat-input"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="e.g. Lounge"
                autoFocus
                maxLength={100}
              />
              <span className="cat-hint">
                Used on the ticket picker and printed on every ticket.
              </span>
            </div>
          </section>

          {/* ---- STEP 2: Ticket types ---- */}
          <section className="cat-card">
            <div className="cat-card-header">
              <span className="cat-step">2</span>
              <div>
                <h2 className="cat-card-title">Ticket Types</h2>
                <p className="cat-card-subtitle">
                  Add up to {MAX_TYPES} types (e.g. Adult, Child, Senior)
                </p>
              </div>
            </div>

            {error && <div className="cat-error">{error}</div>}

            <div className="cat-types">
              {ticketTypes.map((type, index) => (
                <div key={type.id} className="cat-type-row">
                  <span className="cat-type-index">{index + 1}</span>
                  <input
                    type="text"
                    className="cat-input cat-type-input"
                    value={type.name}
                    onChange={(e) =>
                      updateTicketType(type.id, e.target.value)
                    }
                    placeholder="e.g. Adult"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className="cat-type-remove"
                    onClick={() => removeTicketType(type.id)}
                    disabled={ticketTypes.length <= 1}
                    title={
                      ticketTypes.length <= 1
                        ? "At least one type is required"
                        : "Remove type"
                    }
                    aria-label={`Remove type ${index + 1}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="cat-add-type-btn"
              onClick={addTicketType}
              disabled={ticketTypes.length >= MAX_TYPES}
            >
              <PlusIcon />
              {ticketTypes.length >= MAX_TYPES
                ? `Maximum ${MAX_TYPES} types reached`
                : "Add Ticket Type"}
            </button>
          </section>
        </div>

        {/* ============================================ */}
        {/* Preview column                                */}
        {/* ============================================ */}
        <aside className="cat-aside">
          <div className="cat-preview">
            <div className="cat-preview-label">Live preview</div>

            <div className="cat-preview-card">
              <div className="cat-preview-header">
                <span className="cat-preview-cat-name">
                  {form.name.trim() || "Category name"}
                </span>
                <span className="cat-preview-count">
                  {filledTypes.length}{" "}
                  {filledTypes.length === 1 ? "type" : "types"}
                </span>
              </div>

              <div className="cat-preview-body">
                {filledTypes.length === 0 ? (
                  <p className="cat-preview-empty">
                    Add at least one ticket type to see it here.
                  </p>
                ) : (
                  <ul className="cat-preview-list">
                    {filledTypes.map((t) => (
                      <li key={t.id} className="cat-preview-type">
                        <span className="cat-preview-dot" />
                        {t.name.trim()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <p className="cat-preview-note">
              This is how the category will appear when assigning prices to
              an event.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Sticky action bar ---- */}
      <div className="cat-actions">
        <div className="cat-actions-inner">
          <Link
            href="/super-admin/ticket-categories"
            className="cat-btn cat-btn-ghost"
          >
            Cancel
          </Link>
          <button
            type="button"
            className="cat-btn cat-btn-primary"
            onClick={submit}
            disabled={saving || !canSubmit}
          >
            {saving ? "Creating…" : "Create Category"}
            {!saving && <ArrowRightIcon />}
          </button>
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

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
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