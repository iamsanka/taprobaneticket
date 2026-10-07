"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./events.css";

type EventTicket = {
  id: number;
  categoryName: string;
  typeName: string;
  price: number;
  limit: number | null;
};

type EventItem = {
  id: number;
  title: string;
  description: string;
  coverImage: string | null;
  galleryImages: string[] | null;
  location: string;
  eventTime: string;
  visibility: string;
  startDate?: string;
  endDate?: string;
  eventTickets: EventTicket[];
};

type VisibilityFilter = "all" | "ongoing" | "past" | "draft";

type SortKey = "newest" | "oldest" | "title-asc" | "title-desc";

const VISIBILITY_FILTERS: { key: VisibilityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ongoing", label: "Ongoing" },
  { key: "past", label: "Past" },
  { key: "draft", label: "Draft" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title-asc", label: "Title (A → Z)" },
  { key: "title-desc", label: "Title (Z → A)" },
];

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/super-admin/events/list", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        setEvents(data.events || []);
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---- Close modals on Escape ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showConfirm) {
        setShowConfirm(false);
        setDeleteId(null);
      } else if (selectedEvent) {
        setSelectedEvent(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConfirm, selectedEvent]);

  // ---- Lock body scroll when a modal is open ----
  useEffect(() => {
    if (selectedEvent || showConfirm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedEvent, showConfirm]);

  async function deleteEvent() {
    if (!deleteId) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/super-admin/events/delete", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });

      const data = await res.json();

      if (data.success) {
        setEvents(events.filter((e) => e.id !== deleteId));

        if (selectedEvent?.id === deleteId) {
          setSelectedEvent(null);
        }

        setShowConfirm(false);
        setDeleteId(null);
      } else {
        alert(data.error || "Failed to delete event.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeleting(false);
    }
  }

  // ---- Filter + sort ----
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = events.filter((e) => {
      if (visibilityFilter !== "all" && e.visibility !== visibilityFilter) {
        return false;
      }
      if (q) {
        const haystack = `${e.title} ${e.description} ${e.location}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return b.id - a.id;
        case "oldest":
          return a.id - b.id;
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
      }
    });

    return list;
  }, [events, search, visibilityFilter, sortKey]);

  const counts = useMemo(() => {
    const map: Record<VisibilityFilter, number> = {
      all: events.length,
      ongoing: 0,
      past: 0,
      draft: 0,
    };
    for (const e of events) {
      const v = e.visibility as VisibilityFilter;
      if (v in map) map[v] += 1;
    }
    return map;
  }, [events]);

  return (
    <div className="ev-page">
      {/* ---- Header ---- */}
      <div className="ev-header">
        <div>
          <h1 className="ev-title">Events</h1>
          <p className="ev-subtitle">
            Manage your events, ticket types, and visibility
          </p>
        </div>
        <Link href="/super-admin/events/create" className="ev-create-btn">
          <PlusIcon />
          Create Event
        </Link>
      </div>

      {loading && <div className="ev-state">Loading events…</div>}

      {!loading && (
        <>
          {/* ---- Search + Sort ---- */}
          {events.length > 0 && (
            <div className="ev-controls">
              <div className="ev-search-wrap">
                <svg
                  className="ev-search-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="ev-search-input"
                  placeholder="Search events by title, description, or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="ev-search-clear"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              <select
                className="ev-sort-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ---- Visibility filter tabs ---- */}
          {events.length > 0 && (
            <div className="ev-filter-tabs">
              {VISIBILITY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`ev-filter-tab ${
                    visibilityFilter === f.key ? "active" : ""
                  }`}
                  onClick={() => setVisibilityFilter(f.key)}
                >
                  {f.label}
                  {counts[f.key] > 0 && (
                    <span className="ev-filter-count">{counts[f.key]}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ---- Empty states ---- */}
          {events.length === 0 && (
            <div className="ev-state">
              <div className="ev-state-icon">
                <CalendarIcon />
              </div>
              <p className="ev-state-title">No events yet</p>
              <p className="ev-state-text">
                Create your first event to start selling tickets.
              </p>
              <Link
                href="/super-admin/events/create"
                className="ev-state-btn"
              >
                <PlusIcon />
                Create Event
              </Link>
            </div>
          )}

          {events.length > 0 && filteredEvents.length === 0 && (
            <div className="ev-state">
              <p className="ev-state-title">No matching events</p>
              <p className="ev-state-text">
                Try a different search term or filter.
              </p>
            </div>
          )}

          {/* ---- Grid ---- */}
          {filteredEvents.length > 0 && (
            <>
              <div className="ev-grid">
                {filteredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpen={() => setSelectedEvent(event)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setDeleteId(event.id);
                      setShowConfirm(true);
                    }}
                  />
                ))}
              </div>

              <p className="ev-results-count">
                Showing {filteredEvents.length} of {events.length} events
              </p>
            </>
          )}
        </>
      )}

      {/* ---- Detail modal ---- */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={() => {
            setDeleteId(selectedEvent.id);
            setShowConfirm(true);
          }}
        />
      )}

      {/* ---- Delete confirm modal ---- */}
      {showConfirm && (
        <div className="ev-modal-overlay" onClick={() => !deleting && setShowConfirm(false)}>
          <div
            className="ev-modal ev-modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ev-modal-header">
              <h2 className="ev-modal-title">Confirm Delete</h2>
            </div>
            <div className="ev-modal-body">
              <p className="ev-modal-text">
                Are you sure you want to permanently delete this event? This
                action cannot be undone. Any tickets already sold for it will
                remain in orders.
              </p>
            </div>
            <div className="ev-modal-actions">
              <button
                className="ev-btn ev-btn-ghost"
                onClick={() => {
                  setShowConfirm(false);
                  setDeleteId(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="ev-btn ev-btn-danger"
                onClick={deleteEvent}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// Event card
// ======================================================

function EventCard({
  event,
  onOpen,
  onDelete,
}: {
  event: EventItem;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const ticketCount = event.eventTickets.length;

  return (
    <div className="ev-card" onClick={onOpen}>
      {/* ---- Cover ---- */}
      <div className="ev-card-image">
        {event.coverImage ? (
          <img src={event.coverImage} alt={event.title} loading="lazy" />
        ) : (
          <div className="ev-card-image-placeholder">
            <CalendarIcon />
          </div>
        )}

        <span className={`ev-visibility-pill ev-visibility-${event.visibility}`}>
          {formatVisibility(event.visibility)}
        </span>
      </div>

      {/* ---- Body ---- */}
      <div className="ev-card-body">
        <h2 className="ev-card-title">{event.title}</h2>

        <p className="ev-card-description">
          {event.description.length > 110
            ? event.description.slice(0, 110).trimEnd() + "…"
            : event.description}
        </p>

        <ul className="ev-card-meta">
          <li className="ev-card-meta-item">
            <PinIcon />
            <span>{event.location}</span>
          </li>
          <li className="ev-card-meta-item">
            <ClockIcon />
            <span>{event.eventTime}</span>
          </li>
        </ul>

        <div className="ev-card-footer">
          <span className="ev-card-ticket-count">
            <TicketIcon />
            {ticketCount} {ticketCount === 1 ? "ticket type" : "ticket types"}
          </span>
        </div>

        <div className="ev-card-actions">
          <Link
            href={`/super-admin/events/edit/${event.id}`}
            className="ev-btn ev-btn-ghost ev-btn-sm"
            onClick={(e) => e.stopPropagation()}
          >
            Edit
          </Link>
          <button
            className="ev-btn ev-btn-danger-outline ev-btn-sm"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// Detail modal
// ======================================================

function EventModal({
  event,
  onClose,
  onDelete,
}: {
  event: EventItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="ev-modal-overlay" onClick={onClose}>
      <div className="ev-modal" onClick={(e) => e.stopPropagation()}>
        {/* ---- Header ---- */}
        <div className="ev-modal-header">
          <div>
            <span
              className={`ev-visibility-pill ev-visibility-${event.visibility}`}
            >
              {formatVisibility(event.visibility)}
            </span>
            <h2 className="ev-modal-title">{event.title}</h2>
          </div>
          <button
            className="ev-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ---- Body ---- */}
        <div className="ev-modal-body">
          {event.coverImage && (
            <img
              src={event.coverImage}
              className="ev-modal-cover"
              alt={event.title}
            />
          )}

          <div className="ev-modal-meta">
            <div className="ev-modal-meta-item">
              <PinIcon />
              <span>{event.location}</span>
            </div>
            <div className="ev-modal-meta-item">
              <ClockIcon />
              <span>{event.eventTime}</span>
            </div>
          </div>

          <p className="ev-modal-text">{event.description}</p>

          {event.galleryImages && event.galleryImages.length > 0 && (
            <>
              <h3 className="ev-modal-section-title">Gallery</h3>
              <div className="ev-modal-gallery">
                {event.galleryImages.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    className="ev-modal-gallery-img"
                    alt={`Gallery ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          <h3 className="ev-modal-section-title">
            Tickets ({event.eventTickets.length})
          </h3>
          {event.eventTickets.length === 0 ? (
            <p className="ev-modal-text ev-modal-text-muted">
              No tickets assigned to this event yet.
            </p>
          ) : (
            <div className="ev-ticket-list">
              {event.eventTickets.map((t) => (
                <div key={t.id} className="ev-ticket-row">
                  <div className="ev-ticket-row-left">
                    <span className="ev-ticket-category">{t.categoryName}</span>
                    <span className="ev-ticket-dash">—</span>
                    <span className="ev-ticket-type">{t.typeName}</span>
                  </div>
                  <div className="ev-ticket-row-right">
                    <span className="ev-ticket-price">
                      €{(t.price / 100).toFixed(2)}
                    </span>
                    {t.limit != null && (
                      <span className="ev-ticket-limit">
                        Limit {t.limit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Actions ---- */}
        <div className="ev-modal-actions">
          <button className="ev-btn ev-btn-danger-outline" onClick={onDelete}>
            <TrashIcon />
            Delete
          </button>
          <div className="ev-modal-actions-right">
            <Link
              href={`/super-admin/events/edit/${event.id}`}
              className="ev-btn ev-btn-primary"
            >
              Edit Event
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// Helpers
// ======================================================

function formatVisibility(v: string): string {
  return v
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ======================================================
// Icons
// ======================================================

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <line x1="13" y1="8" x2="13" y2="16" strokeDasharray="2 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}