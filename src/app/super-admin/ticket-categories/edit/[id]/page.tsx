"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./edit.css";

type TicketType = {
  id?: number;
  /** Client-side key for React reconciliation */
  key: string;
  name: string;
};

const MAX_TYPES = 5;

function generateKey() {
  return Math.random().toString(36).slice(2, 10);
}

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: categoryId } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "" });
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [originalName, setOriginalName] = useState("");

  // ---- Load ----
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/super-admin/ticket-categories/get?id=${categoryId}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = await res.json();

        if (!data.category) {
          setLoadError("Category not found");
          setLoading(false);
          setTimeout(
            () => router.push("/super-admin/ticket-categories"),
            1500
          );
          return;
        }

        setForm({ name: data.category.name });
        setOriginalName(data.category.name);

        const types: TicketType[] = (data.category.ticketTypes || []).map(
          (t: { id?: number; name: string }) => ({
            id: t.id,
            key: generateKey(),
            name: t.name,
          })
        );

        // If a category somehow has no types, seed one blank row
        if (types.length === 0) {
          types.push({ key: generateKey(), name: "" });
        }

        setTicketTypes(types);
      } catch (err) {
        console.error(err);
        setLoadError("Failed to load category");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [categoryId, router]);

  // ---- Type row handlers ----
  function updateTicketType(key: string, value: string) {
    setTicketTypes((prev) =>
      prev.map((t) => (t.key === key ? { ...t, name: value } : t))
    );
    if (error) setError(null);
  }

  function addTicketType() {
    if (ticketTypes.length >= MAX_TYPES) {
      setError(`Maximum ${MAX_TYPES} ticket types allowed.`);
      return;
    }
    setError(null);
    setTicketTypes((prev) => [
      ...prev,
      { key: generateKey(), name: "" },
    ]);
  }

  function removeTicketType(key: string) {
    setTicketTypes((prev) => prev.filter((t) => t.key !== key));
    if (error) setError(null);
  }

  // ---- Live preview + submit validation ----
  const filledTypes = useMemo(
    () => ticketTypes.filter((t) => t.name.trim()),
    [ticketTypes]
  );

  const hasChanges = useMemo(() => {
    if (form.name !== originalName) return true;
    // Compare types: any new, removed, or renamed
    const originalKeys = new Set(
      ticketTypes.filter((t) => t.id).map((t) => t.id)
    );
    // Simpler: any blank-row present or any name changed
    // We do a lightweight check: length difference or any name mismatch
    // against the original list fetched at load.
    // We store original names in a closure via the original fetch — but
    // to keep it simple and reliable we just compare the count and names
    // via the id map below.
    return true; // always allow save; API handles idempotency
  }, [form.name, originalName, ticketTypes]);

  const canSubmit =
    form.name.trim().length > 0 && filledTypes.length > 0 && !saving;

  // ---- Submit ----
  async function submit() {
    setError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Category name is required.");
      return;
    }

    if (ticketTypes.length === 0) {
      setError("At least one ticket type is required.");
      return;
    }

    const hasEmpty = ticketTypes.some((t) => !t.name.trim());
    if (hasEmpty) {
      setError("Every ticket type needs a name, or remove the empty rows.");
      return;
    }

    const seen = new Set<string>();
    for (const t of ticketTypes) {
      const k = t.name.trim().toLowerCase();
      if (seen.has(k)) {
        setError(`Duplicate ticket type: "${t.name.trim()}"`);
        return;
      }
      seen.add(k);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/ticket-categories/edit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          id: Number(categoryId),
          name: trimmedName,
          ticketTypesList: ticketTypes.map((t) => ({
            id: t.id, // existing types keep their id; new ones have undefined
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

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="edit-page">
        <div className="edit-state">
          <div className="edit-state-spinner" />
          <p className="edit-state-text">Loading category…</p>
        </div>
      </div>
    );
  }

  // ---- Load error state ----
  if (loadError) {
    return (
      <div className="edit-page">
        <Link
          href="/super-admin/ticket-categories"
          className="edit-back"
        >
          <ArrowLeftIcon />
          Back to Categories
        </Link>
        <div className="edit-state">
          <p className="edit-state-title">{loadError}</p>
          <p className="edit-state-text">
            Redirecting back to categories…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/ticket-categories" className="edit-back">
        <ArrowLeftIcon />
        Back to Categories
      </Link>

      {/* ---- Header ---- */}
      <header className="edit-header">
        <div>
          <h1 className="edit-title">Edit Ticket Category</h1>
          <p className="edit-subtitle">
            Update the category name and adjust ticket types
          </p>
        </div>
      </header>

      <div className="edit-layout">
        {/* ============================================ */}
        {/* Main column                                   */}
        {/* ============================================ */}
        <div className="edit-main">
          {/* ---- STEP 1: Category name ---- */}
          <section className="edit-card">
            <div className="edit-card-header">
              <span className="edit-step">1</span>
              <div>
                <h2 className="edit-card-title">Category</h2>
                <p className="edit-card-subtitle">
                  A short label that groups ticket types together
                </p>
              </div>
            </div>

            <div className="edit-field">
              <label className="edit-label" htmlFor="edit-cat-name">
                Category Name <span className="edit-required">*</span>
              </label>
              <input
                id="edit-cat-name"
                type="text"
                className="edit-input"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="e.g. Lounge"
                maxLength={100}
              />
              <span className="edit-hint">
                Changing this name updates it everywhere the category appears.
              </span>
            </div>
          </section>

          {/* ---- STEP 2: Ticket types ---- */}
          <section className="edit-card">
            <div className="edit-card-header">
              <span className="edit-step">2</span>
              <div>
                <h2 className="edit-card-title">Ticket Types</h2>
                <p className="edit-card-subtitle">
                  Edit existing types, add new ones, or remove unused ones
                  (max {MAX_TYPES})
                </p>
              </div>
            </div>

            {error && <div className="edit-error">{error}</div>}

            <div className="edit-types">
              {ticketTypes.map((type, index) => (
                <div key={type.key} className="edit-type-row">
                  <span className="edit-type-index">{index + 1}</span>
                  <input
                    type="text"
                    className="edit-input edit-type-input"
                    value={type.name}
                    onChange={(e) =>
                      updateTicketType(type.key, e.target.value)
                    }
                    placeholder="e.g. Adult"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className="edit-type-remove"
                    onClick={() => removeTicketType(type.key)}
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
              className="edit-add-type-btn"
              onClick={addTicketType}
              disabled={ticketTypes.length >= MAX_TYPES}
            >
              <PlusIcon />
              {ticketTypes.length >= MAX_TYPES
                ? `Maximum ${MAX_TYPES} types reached`
                : "Add Ticket Type"}
            </button>

            <p className="edit-note">
              Removing a type here only removes it from the category. Ticket
              types already attached to events keep their history.
            </p>
          </section>
        </div>

        {/* ============================================ */}
        {/* Preview column                                */}
        {/* ============================================ */}
        <aside className="edit-aside">
          <div className="edit-preview">
            <div className="edit-preview-label">Live preview</div>

            <div className="edit-preview-card">
              <div className="edit-preview-header">
                <span className="edit-preview-cat-name">
                  {form.name.trim() || "Category name"}
                </span>
                <span className="edit-preview-count">
                  {filledTypes.length}{" "}
                  {filledTypes.length === 1 ? "type" : "types"}
                </span>
              </div>

              <div className="edit-preview-body">
                {filledTypes.length === 0 ? (
                  <p className="edit-preview-empty">
                    Add at least one ticket type to see it here.
                  </p>
                ) : (
                  <ul className="edit-preview-list">
                    {filledTypes.map((t) => (
                      <li key={t.key} className="edit-preview-type">
                        <span className="edit-preview-dot" />
                        {t.name.trim()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <p className="edit-preview-note">
              Changes are applied after you save.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Sticky action bar ---- */}
      <div className="edit-actions">
        <div className="edit-actions-inner">
          <Link
            href="/super-admin/ticket-categories"
            className="edit-btn edit-btn-ghost"
          >
            Cancel
          </Link>
          <button
            type="button"
            className="edit-btn edit-btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {saving ? "Saving…" : "Save Changes"}
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