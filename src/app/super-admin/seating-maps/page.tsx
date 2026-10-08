"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./SeatingMaps.css";

type SeatingMapRow = {
  id: number;
  eventId: number;
  categoryId: number;
  name: string;
  stagePosition: "top" | "bottom" | "none";
  createdAt: string;
  updatedAt: string;
  eventTitle: string | null;
  categoryName: string | null;
  createdByEmail: string | null;
  sectionCount: number;
  seatCount: number;
  blockedCount: number;
  bookedCount: number;
};

type EventOption = { id: number; title: string };
type CategoryOption = { id: number; name: string };

type SectionDraft = {
  key: string;
  label: string;
  rows: string;
  colsPerRow: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function newSectionDraft(label: string): SectionDraft {
  return {
    key: Math.random().toString(36).slice(2),
    label,
    rows: "10",
    colsPerRow: "20",
  };
}

export default function SeatingMapsPage() {
  const router = useRouter();

  const [maps, setMaps] = useState<SeatingMapRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        eventFilter === "all"
          ? "/api/super-admin/seating-maps"
          : `/api/super-admin/seating-maps?eventId=${eventFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setMaps(data.maps ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [eventFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [evRes, catRes] = await Promise.all([
          fetch("/api/super-admin/events/list", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/super-admin/ticket-categories/list", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (evRes.ok) {
          const evData = await evRes.json();
          setEvents(evData.events ?? []);
        } else {
          console.warn("[seating-maps] events fetch failed:", evRes.status);
        }

        if (catRes.ok) {
          const catData = await catRes.json();
          const raw =
            catData.categories ??
            catData.ticketCategories ??
            catData.items ??
            catData.data?.categories ??
            catData.data?.ticketCategories ??
            catData.data?.items ??
            catData.data ??
            catData;

          if (Array.isArray(raw)) {
            setCategories(raw);
          } else {
            console.warn(
              "[seating-maps] categories response shape unrecognized:",
              Object.keys(catData ?? {})
            );
            setCategories([]);
          }
        } else {
          console.warn(
            "[seating-maps] categories fetch failed:",
            catRes.status
          );
          setCategories([]);
        }
      } catch (err) {
        console.error("Failed to load meta:", err);
      }
    }
    loadMeta();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return maps;
    return maps.filter((m) => {
      const hay = `${m.name} ${m.eventTitle ?? ""} ${
        m.categoryName ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [maps, search]);

  async function handleDelete(m: SeatingMapRow) {
    if (m.bookedCount > 0) {
      alert(
        `This map has ${m.bookedCount} booked ${
          m.bookedCount === 1 ? "seat" : "seats"
        }.\n\nCancel or refund those orders first, then delete the map.`
      );
      return;
    }

    const ok = window.confirm(
      `Delete seating map "${m.name}" for ${m.eventTitle ?? "—"} / ${
        m.categoryName ?? "—"
      }?\n\n` +
        `This removes ${m.seatCount} ${
          m.seatCount === 1 ? "seat" : "seats"
        } and cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(m.id);
    try {
      const res = await fetch(
        `/api/super-admin/seating-maps/${m.id}?confirm=delete`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        alert(body?.error || "Failed to delete");
        return;
      }
      setMaps((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="sm-page">
      <header className="sm-header">
        <div>
          <h1 className="sm-title">Seating Maps</h1>
          <p className="sm-subtitle">
            Define seat layouts per event and category. Only seated categories
            need a map.
          </p>
        </div>
        <button
          className="sm-add-btn"
          onClick={() => setShowCreate(true)}
          disabled={events.length === 0 || categories.length === 0}
          title={
            events.length === 0
              ? "Create an event first"
              : categories.length === 0
              ? "Create a ticket category first"
              : undefined
          }
        >
          <PlusIcon />
          New Map
        </button>
      </header>

      <section className="sm-filters">
        <div className="sm-filter">
          <label className="sm-filter-label">Event</label>
          <select
            className="sm-select"
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

        <div className="sm-filter sm-filter-search">
          <label className="sm-filter-label">Search</label>
          <input
            type="text"
            className="sm-select"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Map, event, or category…"
          />
        </div>

        <div className="sm-filter sm-filter-actions">
          <button
            className="sm-reset-btn"
            onClick={() => {
              setEventFilter("all");
              setSearch("");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {loading && (
        <div className="sm-state">
          <div className="sm-state-spinner" />
          <p className="sm-state-text">Loading seating maps…</p>
        </div>
      )}

      {error && <div className="sm-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="sm-state">
          <div className="sm-state-icon">
            <GridIcon />
          </div>
          <p className="sm-state-title">
            {maps.length === 0
              ? "No seating maps yet"
              : "No maps match your filters"}
          </p>
          <p className="sm-state-text">
            {maps.length === 0
              ? "Create a map to enable seat selection for a seated category."
              : "Try a different event or search term."}
          </p>
          {maps.length === 0 &&
            events.length > 0 &&
            categories.length > 0 && (
              <button
                className="sm-add-btn"
                style={{ marginTop: 16 }}
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon />
                New Map
              </button>
            )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="sm-table-wrap">
          <table className="sm-table">
            <thead>
              <tr>
                <th>Map</th>
                <th>Event</th>
                <th>Category</th>
                <th className="sm-td-right">Sections</th>
                <th className="sm-td-right">Seats</th>
                <th className="sm-td-right">Blocked</th>
                <th className="sm-td-right">Booked</th>
                <th>Created</th>
                <th className="sm-td-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="sm-row-clickable"
                  onClick={() =>
                    router.push(`/super-admin/seating-maps/${m.id}`)
                  }
                >
                  <td className="sm-td-strong">{m.name}</td>
                  <td className="sm-td-muted">
                    {m.eventTitle ?? "—"}
                  </td>
                  <td>
                    <span className="sm-pill">{m.categoryName ?? "—"}</span>
                  </td>
                  <td className="sm-td-right">{m.sectionCount}</td>
                  <td className="sm-td-right">{m.seatCount}</td>
                  <td className="sm-td-right">
                    {m.blockedCount > 0 ? (
                      <span className="sm-count-blocked">
                        {m.blockedCount}
                      </span>
                    ) : (
                      <span className="sm-td-muted">0</span>
                    )}
                  </td>
                  <td className="sm-td-right">
                    {m.bookedCount > 0 ? (
                      <span className="sm-count-booked">
                        {m.bookedCount}
                      </span>
                    ) : (
                      <span className="sm-td-muted">0</span>
                    )}
                  </td>
                  <td className="sm-td-muted">
                    {formatDate(m.createdAt)}
                  </td>
                  <td
                    className="sm-td-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sm-row-actions">
                      <Link
                        href={`/super-admin/seating-maps/${m.id}`}
                        className="sm-action-btn"
                      >
                        Edit
                      </Link>
                      <button
                        className="sm-action-btn sm-action-danger"
                        disabled={deletingId === m.id}
                        onClick={() => handleDelete(m)}
                        title={
                          m.bookedCount > 0
                            ? "Cannot delete a map with booked seats"
                            : "Delete this map"
                        }
                      >
                        {deletingId === m.id ? "…" : "Delete"}
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
        <p className="sm-results-count">
          Showing {filtered.length} of {maps.length} maps
        </p>
      )}

      {showCreate && (
        <CreateMapModal
          events={events}
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={(newId) => {
            setShowCreate(false);
            router.push(`/super-admin/seating-maps/${newId}`);
          }}
        />
      )}
    </div>
  );
}

// ======================================================
// Create modal
// ======================================================

function CreateMapModal({
  events,
  categories,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [eventId, setEventId] = useState<string>(
    events[0] ? String(events[0].id) : ""
  );
  const [categoryId, setCategoryId] = useState<string>(
    categories[0] ? String(categories[0].id) : ""
  );
  const [name, setName] = useState("");
  // ⭐ NEW — stage position
  const [stagePosition, setStagePosition] = useState<"top" | "bottom" | "none">(
    "top"
  );
  const [sections, setSections] = useState<SectionDraft[]>([
    newSectionDraft("Main"),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalSeats = useMemo(
    () =>
      sections.reduce((sum, s) => {
        const r = Number(s.rows);
        const c = Number(s.colsPerRow);
        if (!Number.isInteger(r) || !Number.isInteger(c)) return sum;
        if (r < 1 || c < 1) return sum;
        return sum + r * c;
      }, 0),
    [sections]
  );

  function updateSection(key: string, patch: Partial<SectionDraft>) {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
    );
  }

  function removeSection(key: string) {
    setSections((prev) => prev.filter((s) => s.key !== key));
  }

  function addSection() {
    const nextLabel = `Section ${sections.length + 1}`;
    setSections((prev) => [...prev, newSectionDraft(nextLabel)]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!eventId) {
      setError("Please select an event");
      return;
    }
    if (!categoryId) {
      setError("Please select a category");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a map name");
      return;
    }
    if (sections.length === 0) {
      setError("At least one section is required");
      return;
    }

    const parsedSections = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const label = s.label.trim();
      const rows = Number(s.rows);
      const colsPerRow = Number(s.colsPerRow);

      if (!label) {
        setError(`Section ${i + 1}: label is required`);
        return;
      }
      if (!Number.isInteger(rows) || rows < 1 || rows > 200) {
        setError(`Section "${label}": rows must be 1–200`);
        return;
      }
      if (
        !Number.isInteger(colsPerRow) ||
        colsPerRow < 1 ||
        colsPerRow > 200
      ) {
        setError(`Section "${label}": columns must be 1–200`);
        return;
      }
      parsedSections.push({ label, rows, colsPerRow });
    }

    const labels = parsedSections.map((s) => s.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      setError("Section labels must be unique");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/seating-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: Number(eventId),
          categoryId: Number(categoryId),
          name: trimmedName,
          stagePosition, // ⭐
          sections: parsedSections,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || "Failed to create seating map");
        return;
      }
      onCreated(body.map.id);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="sm-modal-overlay"
      onClick={() => !saving && onClose()}
    >
      <div
        className="sm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">New Seating Map</h2>
          <button
            className="sm-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="sm-modal-body">
          {error && <div className="sm-modal-error">{error}</div>}

          <label className="sm-field">
            <span className="sm-field-label">
              Event <span className="sm-required">*</span>
            </span>
            <select
              className="sm-input"
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
          </label>

          <label className="sm-field">
            <span className="sm-field-label">
              Ticket category <span className="sm-required">*</span>
            </span>
            <select
              className="sm-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— Select a category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="sm-field-hint">
              The category that requires seat selection (e.g. Balcony).
            </span>
          </label>

          <label className="sm-field">
            <span className="sm-field-label">
              Map name <span className="sm-required">*</span>
            </span>
            <input
              type="text"
              className="sm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Hall, Upper Balcony"
              maxLength={128}
            />
          </label>

          {/* ⭐ NEW — stage position */}
          <label className="sm-field">
            <span className="sm-field-label">Stage position</span>
            <select
              className="sm-input"
              value={stagePosition}
              onChange={(e) =>
                setStagePosition(e.target.value as "top" | "bottom" | "none")
              }
            >
              <option value="top">Top — audience faces up</option>
              <option value="bottom">Bottom — audience faces down</option>
              <option value="none">None — no stage</option>
            </select>
            <span className="sm-field-hint">
              Shows a "STAGE" banner on the customer seat picker so they
              understand which way to face.
            </span>
          </label>

          <div className="sm-field">
            <span className="sm-field-label">Sections</span>
            <span className="sm-field-hint" style={{ marginBottom: 8 }}>
              Add one section per physical area. Use a single "Main" section
              for small venues, or Left / Center / Right for larger ones.
            </span>

            <div className="sm-sections-list">
              {sections.map((s, idx) => (
                <div key={s.key} className="sm-section-row">
                  <input
                    type="text"
                    className="sm-input sm-input-label"
                    value={s.label}
                    onChange={(e) =>
                      updateSection(s.key, { label: e.target.value })
                    }
                    placeholder={`Section ${idx + 1}`}
                    maxLength={64}
                  />
                  <input
                    type="number"
                    className="sm-input sm-input-num"
                    value={s.rows}
                    onChange={(e) =>
                      updateSection(s.key, { rows: e.target.value })
                    }
                    placeholder="Rows"
                    min={1}
                    max={200}
                  />
                  <span className="sm-section-times">×</span>
                  <input
                    type="number"
                    className="sm-input sm-input-num"
                    value={s.colsPerRow}
                    onChange={(e) =>
                      updateSection(s.key, { colsPerRow: e.target.value })
                    }
                    placeholder="Cols"
                    min={1}
                    max={200}
                  />
                  <button
                    type="button"
                    className="sm-section-remove"
                    onClick={() => removeSection(s.key)}
                    disabled={sections.length === 1}
                    title={
                      sections.length === 1
                        ? "At least one section is required"
                        : "Remove this section"
                    }
                    aria-label="Remove section"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="sm-section-add"
              onClick={addSection}
            >
              <PlusIcon />
              Add section
            </button>

            <div className="sm-seat-total">
              Total: <strong>{totalSeats}</strong>{" "}
              {totalSeats === 1 ? "seat" : "seats"}
            </div>
          </div>

          <div className="sm-modal-actions">
            <button
              type="button"
              className="sm-btn sm-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sm-btn sm-btn-primary"
              disabled={saving}
            >
              {saving ? "Creating…" : "Create map"}
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

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}