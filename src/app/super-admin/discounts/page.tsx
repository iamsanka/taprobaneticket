"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./Discounts.css";

type Discount = {
  id: number;
  eventId: number;
  eventTitle: string | null;
  code: string;
  percentage: number;
  maxUses: number | null;
  usedCount: number;
  remainingUses: number | null;
  isExhausted: boolean;
  expiresAt: string | null;
  isActive: boolean;
  createdByEmail: string | null;
  createdAt: string;
};

type EventOption = { id: number; title: string };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DiscountsPage() {
  const pathname = usePathname();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "exhausted"
  >("all");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);

  // Row actions
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ----- Load discounts -----
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url =
        eventFilter === "all"
          ? "/api/super-admin/discounts"
          : `/api/super-admin/discounts?eventId=${eventFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setDiscounts(data.discounts ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // ----- Load events for filter + create modal -----
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
  }, [eventFilter]);

  // ----- Toggle active -----
  async function toggleActive(d: Discount) {
    const next = !d.isActive;
    const ok = window.confirm(
      next
        ? `Activate code ${d.code}? Customers will be able to apply it again.`
        : `Deactivate code ${d.code}? Customers will no longer be able to apply it.`
    );
    if (!ok) return;

    setTogglingId(d.id);
    try {
      const res = await fetch(`/api/super-admin/discounts/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to update");
        return;
      }
      setDiscounts((prev) =>
        prev.map((x) =>
          x.id === d.id ? { ...x, isActive: next } : x
        )
      );
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setTogglingId(null);
    }
  }

  // ----- Delete -----
  async function handleDelete(d: Discount) {
    if (d.usedCount > 0) {
      alert(
        `This code has been used ${d.usedCount} ${
          d.usedCount === 1 ? "time" : "times"
        }. Deactivate it instead of deleting to preserve history.`
      );
      return;
    }

    const ok = window.confirm(
      `Permanently delete code ${d.code}?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(d.id);
    try {
      const res = await fetch(
        `/api/super-admin/discounts/${d.id}?confirm=delete`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete");
        return;
      }
      setDiscounts((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  // ----- Copy code to clipboard -----
  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      // Very brief visual feedback could be added here
    } catch {
      alert(`Could not copy. The code is: ${code}`);
    }
  }

  // ----- Filtered list -----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discounts.filter((d) => {
      if (statusFilter === "active" && !d.isActive) return false;
      if (statusFilter === "inactive" && d.isActive) return false;
      if (statusFilter === "exhausted" && !d.isExhausted) return false;
      if (q) {
        const hay = `${d.code} ${d.eventTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [discounts, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: discounts.length,
      active: discounts.filter((d) => d.isActive && !d.isExhausted).length,
      inactive: discounts.filter((d) => !d.isActive).length,
      exhausted: discounts.filter((d) => d.isExhausted).length,
    };
  }, [discounts]);

  return (
    <div className="dc-page">
      {/* ---- Header ---- */}
      <header className="dc-header">
        <div>
          <h1 className="dc-title">Discount Codes</h1>
          <p className="dc-subtitle">
            Create single-use or multi-use promo codes for any event
          </p>
        </div>
        <button
          className="dc-add-btn"
          onClick={() => setShowCreate(true)}
          disabled={events.length === 0}
          title={
            events.length === 0
              ? "Create an event first before adding discount codes"
              : undefined
          }
        >
          <PlusIcon />
          Generate Code
        </button>
      </header>

      {/* ---- Filters ---- */}
      <section className="dc-filters">
        <div className="dc-filter">
          <label className="dc-filter-label">Event</label>
          <select
            className="dc-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>

        <div className="dc-filter">
          <label className="dc-filter-label">Status</label>
          <select
            className="dc-select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "all" | "active" | "inactive" | "exhausted"
              )
            }
          >
            <option value="all">All ({counts.all})</option>
            <option value="active">Active ({counts.active})</option>
            <option value="inactive">Inactive ({counts.inactive})</option>
            <option value="exhausted">Exhausted ({counts.exhausted})</option>
          </select>
        </div>

        <div className="dc-filter dc-filter-search">
          <label className="dc-filter-label">Search</label>
          <input
            type="text"
            className="dc-select"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or event name…"
          />
        </div>

        <div className="dc-filter dc-filter-actions">
          <button
            className="dc-reset-btn"
            onClick={() => {
              setEventFilter("all");
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {loading && (
        <div className="dc-state">
          <div className="dc-state-spinner" />
          <p className="dc-state-text">Loading codes…</p>
        </div>
      )}

      {error && <div className="dc-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="dc-state">
          <div className="dc-state-icon">
            <TagIcon />
          </div>
          <p className="dc-state-title">
            {discounts.length === 0
              ? "No discount codes yet"
              : "No codes match your filters"}
          </p>
          <p className="dc-state-text">
            {discounts.length === 0
              ? "Generate a code to offer customers a percentage off."
              : "Try a different event or search term."}
          </p>
          {discounts.length === 0 && events.length > 0 && (
            <button
              className="dc-add-btn"
              style={{ marginTop: 16 }}
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon />
              Generate Code
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="dc-table-wrap">
          <table className="dc-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Event</th>
                <th className="dc-td-right">Discount</th>
                <th className="dc-td-right">Uses</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="dc-td-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button
                      className="dc-code"
                      onClick={() => copyCode(d.code)}
                      title="Click to copy"
                    >
                      {d.code}
                      <CopyIcon />
                    </button>
                  </td>
                  <td className="dc-td-muted">
                    {d.eventTitle ?? "—"}
                  </td>
                  <td className="dc-td-right dc-td-strong">
                    {d.percentage}%
                  </td>
                  <td className="dc-td-right">
                    {d.maxUses === null ? (
                      <span className="dc-unlimited">
                        {d.usedCount} used · unlimited
                      </span>
                    ) : (
                      <span
                        className={
                          d.isExhausted
                            ? "dc-exhausted"
                            : "dc-uses"
                        }
                      >
                        {d.usedCount} / {d.maxUses}
                      </span>
                    )}
                  </td>
                  <td className="dc-td-muted">
                    {d.expiresAt ? formatDate(d.expiresAt) : "Never"}
                  </td>
                  <td>
                    <StatusPill discount={d} />
                  </td>
                  <td className="dc-td-right">
                    <div className="dc-row-actions">
                      <button
                        className={`dc-action-btn ${
                          d.isActive ? "dc-action-warn" : "dc-action-success"
                        }`}
                        disabled={togglingId === d.id}
                        onClick={() => toggleActive(d)}
                      >
                        {togglingId === d.id
                          ? "…"
                          : d.isActive
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                      <button
                        className="dc-action-btn dc-action-danger"
                        disabled={deletingId === d.id || d.usedCount > 0}
                        onClick={() => handleDelete(d)}
                        title={
                          d.usedCount > 0
                            ? "Cannot delete a used code — deactivate it instead"
                            : "Delete permanently"
                        }
                      >
                        {deletingId === d.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <p className="dc-results-count">
          Showing {filtered.length} of {discounts.length} codes
        </p>
      )}

      {/* ---- Create modal ---- */}
      {showCreate && (
        <CreateDiscountModal
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
// Status pill
// ======================================================

function StatusPill({ discount }: { discount: Discount }) {
  if (!discount.isActive) {
    return <span className="dc-pill dc-pill-inactive">Inactive</span>;
  }
  if (discount.isExhausted) {
    return <span className="dc-pill dc-pill-exhausted">Exhausted</span>;
  }
  if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
    return <span className="dc-pill dc-pill-expired">Expired</span>;
  }
  return <span className="dc-pill dc-pill-active">Active</span>;
}

// ======================================================
// Create modal
// ======================================================

function CreateDiscountModal({
  events,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [eventId, setEventId] = useState<string>(
    events[0] ? String(events[0].id) : ""
  );
  const [percentage, setPercentage] = useState<string>("10");
  const [limitEnabled, setLimitEnabled] = useState<boolean>(true);
  const [maxUses, setMaxUses] = useState<string>("10");
  const [expiryEnabled, setExpiryEnabled] = useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [customCode, setCustomCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!eventId) {
      setError("Please select an event");
      return;
    }

    const pct = Number(percentage);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      setError("Percentage must be a whole number between 1 and 100");
      return;
    }

    let maxUsesValue: number | null = null;
    if (limitEnabled) {
      const n = Number(maxUses);
      if (!Number.isInteger(n) || n < 1) {
        setError("Limit must be a positive whole number");
        return;
      }
      maxUsesValue = n;
    }

    let expiresAtValue: string | null = null;
    if (expiryEnabled) {
      if (!expiresAt) {
        setError("Pick an expiry date");
        return;
      }
      expiresAtValue = expiresAt;
    }

    const trimmedCustom = customCode.trim();

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: Number(eventId),
          percentage: pct,
          maxUses: maxUsesValue,
          expiresAt: expiresAtValue,
          code: trimmedCustom || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to create discount code");
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
      className="dc-modal-overlay"
      onClick={() => !saving && onClose()}
    >
      <div
        className="dc-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dc-modal-header">
          <h2 className="dc-modal-title">Generate Discount Code</h2>
          <button
            className="dc-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="dc-modal-body">
          {error && <div className="dc-modal-error">{error}</div>}

          <label className="dc-field">
            <span className="dc-field-label">
              Event <span className="dc-required">*</span>
            </span>
            <select
              className="dc-input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">— Select an event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
            <span className="dc-field-hint">
              This code will only work for this event.
            </span>
          </label>

          <label className="dc-field">
            <span className="dc-field-label">
              Discount percentage <span className="dc-required">*</span>
            </span>
            <div className="dc-input-suffix">
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className="dc-input"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="10"
              />
              <span className="dc-input-suffix-text">%</span>
            </div>
            <span className="dc-field-hint">
              Whole numbers only, 1–100.
            </span>
          </label>

          {/* ---- Usage limit ---- */}
          <div className="dc-field">
            <label className="dc-toggle">
              <input
                type="checkbox"
                checked={limitEnabled}
                onChange={(e) => setLimitEnabled(e.target.checked)}
              />
              <span>Limit how many orders can use this code</span>
            </label>

            {limitEnabled && (
              <div className="dc-input-suffix" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="dc-input"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="10"
                />
                <span className="dc-input-suffix-text">uses</span>
              </div>
            )}

            <span className="dc-field-hint">
              {limitEnabled
                ? `Only the first ${maxUses || "?"} ${
                    maxUses === "1" ? "order" : "orders"
                  } can apply this code.`
                : "No limit — the code can be used any number of times (until it's deactivated or expires)."}
            </span>
          </div>

          {/* ---- Expiry ---- */}
          <div className="dc-field">
            <label className="dc-toggle">
              <input
                type="checkbox"
                checked={expiryEnabled}
                onChange={(e) => setExpiryEnabled(e.target.checked)}
              />
              <span>Set an expiry date</span>
            </label>

            {expiryEnabled && (
              <input
                type="date"
                className="dc-input"
                style={{ marginTop: 8 }}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            )}
            <span className="dc-field-hint">
              {expiryEnabled
                ? "The code stops working at the end of this day."
                : "The code never expires on its own."}
            </span>
          </div>

          {/* ---- Optional custom code ---- */}
          <label className="dc-field">
            <span className="dc-field-label">
              Custom code (optional)
            </span>
            <input
              type="text"
              className="dc-input dc-input-mono"
              value={customCode}
              onChange={(e) =>
                setCustomCode(e.target.value.toUpperCase())
              }
              placeholder="Leave empty to auto-generate"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="dc-field-hint">
              Only uppercase letters and digits. Leave blank to let us
              generate a random code like{" "}
              <code>MKW4RQ7F</code>.
            </span>
          </label>

          <div className="dc-modal-actions">
            <button
              type="button"
              className="dc-btn dc-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="dc-btn dc-btn-primary"
              disabled={saving}
            >
              {saving ? "Creating…" : "Generate Code"}
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}