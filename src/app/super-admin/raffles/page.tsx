"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "./Raffles.css";

// ======================================================
// Types
// ======================================================

type RaffleRow = {
  id: number;
  eventId: number;
  name: string;
  winnerCount: number;
  status: string;
  drawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventTitle: string | null;
  createdByEmail: string | null;
  actualWinnerCount: number;
};

type EventOption = { id: number; title: string };

type ApiListResponse = {
  raffles: RaffleRow[];
  poolByEvent: Record<number, number>;
  availableEvents: EventOption[];
};

type ApiCreateResponse = {
  raffle: {
    id: number;
    eventId: number;
    eventTitle: string | null;
    name: string;
    winnerCount: number;
    status: string;
  };
  currentPoolSize: number;
  canDrawNow: boolean;
  willCapAtPool: boolean;
};

// ======================================================
// Helpers
// ======================================================

function formatDate(iso: string | null): string {
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

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ======================================================
// Page
// ======================================================

export default function RafflesPage() {
  const router = useRouter();
  const pathname = usePathname();

  // ⭐ Role-aware: only SUPER_ADMIN can create or delete raffles.
  // The admin tree re-exports this same component under /admin/raffles,
  // so we use the pathname to know which context we're rendering in.
  const isAdminTree = pathname?.startsWith("/admin") ?? false;
  const canCreate = !isAdminTree;
  const canDelete = !isAdminTree;

  const [raffles, setRaffles] = useState<RaffleRow[]>([]);
  const [poolByEvent, setPoolByEvent] = useState<Record<number, number>>({});
  const [availableEvents, setAvailableEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "drawn"
  >("all");

  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        eventFilter === "all"
          ? "/api/super-admin/raffles"
          : `/api/super-admin/raffles?eventId=${eventFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as ApiListResponse;
      setRaffles(data.raffles ?? []);
      setPoolByEvent(data.poolByEvent ?? {});
      setAvailableEvents(data.availableEvents ?? []);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return raffles.filter((r) => {
      if (statusFilter === "draft" && r.status !== "draft") return false;
      if (statusFilter === "drawn" && r.status !== "drawn") return false;
      if (q) {
        const hay = `${r.name} ${r.eventTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [raffles, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: raffles.length,
      draft: raffles.filter((r) => r.status === "draft").length,
      drawn: raffles.filter((r) => r.status === "drawn").length,
    };
  }, [raffles]);

  async function handleDelete(r: RaffleRow) {
    if (!canDelete) return;
    const ok = window.confirm(
      `Delete raffle "${r.name}" for ${r.eventTitle ?? "—"}?\n\n` +
        (r.status === "drawn"
          ? `This raffle has been drawn with ${r.actualWinnerCount} ${
              r.actualWinnerCount === 1 ? "winner" : "winners"
            }. Deleting it will lose that result.\n\n`
          : "") +
        `This cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(r.id);
    try {
      const res = await fetch(
        `/api/super-admin/raffles/${r.id}?confirm=delete`,
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        alert(body?.error || "Failed to delete");
        return;
      }
      setRaffles((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  // Detail page link — mirrors the current tree (super-admin vs admin)
  const detailHrefBase = isAdminTree
    ? "/admin/raffles"
    : "/super-admin/raffles";

  return (
    <div className="rf-page">
      <header className="rf-header">
        <div>
          <h1 className="rf-title">Raffles</h1>
          <p className="rf-subtitle">
            {canCreate
              ? "Create raffles and draw random winners from paid customers."
              : "Draw random winners from customers who have paid for an event."}
          </p>
        </div>
        {canCreate && (
          <button
            className="rf-add-btn"
            onClick={() => setShowCreate(true)}
            disabled={availableEvents.length === 0}
            title={
              availableEvents.length === 0
                ? "No events with paid customers yet"
                : undefined
            }
          >
            <PlusIcon />
            New Raffle
          </button>
        )}
      </header>

      <section className="rf-filters">
        <div className="rf-filter">
          <label className="rf-filter-label">Event</label>
          <select
            className="rf-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">All events</option>
            {availableEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>

        <div className="rf-filter">
          <label className="rf-filter-label">Status</label>
          <select
            className="rf-select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "draft" | "drawn")
            }
          >
            <option value="all">All ({counts.all})</option>
            <option value="draft">Draft ({counts.draft})</option>
            <option value="drawn">Drawn ({counts.drawn})</option>
          </select>
        </div>

        <div className="rf-filter rf-filter-search">
          <label className="rf-filter-label">Search</label>
          <input
            type="text"
            className="rf-select"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Raffle or event name…"
          />
        </div>

        <div className="rf-filter rf-filter-actions">
          <button
            className="rf-reset-btn"
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
        <div className="rf-state">
          <div className="rf-state-spinner" />
          <p className="rf-state-text">Loading raffles…</p>
        </div>
      )}

      {error && <div className="rf-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="rf-state">
          <div className="rf-state-icon">
            <TrophyIcon />
          </div>
          <p className="rf-state-title">
            {raffles.length === 0
              ? "No raffles yet"
              : "No raffles match your filters"}
          </p>
          <p className="rf-state-text">
            {raffles.length === 0
              ? canCreate
                ? availableEvents.length === 0
                  ? "You need at least one event with paid customers before you can create a raffle."
                  : "Create a raffle to draw random winners from your paid customers."
                : "No raffles have been created yet. Ask a super admin to set one up."
              : "Try a different event or search term."}
          </p>
          {raffles.length === 0 &&
            canCreate &&
            availableEvents.length > 0 && (
              <button
                className="rf-add-btn"
                style={{ marginTop: 16 }}
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon />
                New Raffle
              </button>
            )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="rf-table-wrap">
          <table className="rf-table">
            <thead>
              <tr>
                <th>Raffle</th>
                <th>Event</th>
                <th className="rf-td-right">Winners</th>
                <th className="rf-td-right">Pool</th>
                <th>Status</th>
                <th>Drawn</th>
                <th className="rf-td-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const pool = poolByEvent[r.eventId] ?? 0;
                const capWarning = pool < r.winnerCount;

                return (
                  <tr
                    key={r.id}
                    className="rf-row-clickable"
                    onClick={() =>
                      router.push(`${detailHrefBase}/${r.id}`)
                    }
                  >
                    <td className="rf-td-strong">{r.name}</td>
                    <td className="rf-td-muted">{r.eventTitle ?? "—"}</td>
                    <td className="rf-td-right">
                      <span className="rf-count-strong">
                        {r.winnerCount}
                      </span>
                      {r.status === "drawn" && (
                        <span className="rf-count-sub">
                          {" "}
                          · {r.actualWinnerCount} picked
                        </span>
                      )}
                    </td>
                    <td className="rf-td-right">
                      <span
                        className={
                          capWarning ? "rf-pool-warn" : "rf-pool-ok"
                        }
                        title={
                          capWarning
                            ? `Only ${pool} eligible customers — draw will cap at ${pool}`
                            : `${pool} eligible customers`
                        }
                      >
                        {pool}
                      </span>
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td className="rf-td-muted">
                      {r.drawnAt ? formatDate(r.drawnAt) : "—"}
                    </td>
                    <td
                      className="rf-td-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="rf-row-actions">
                        <Link
                          href={`${detailHrefBase}/${r.id}`}
                          className="rf-action-btn"
                        >
                          {r.status === "draft" ? "Draw" : "Open"}
                        </Link>
                        {canDelete && (
                          <button
                            className="rf-action-btn rf-action-danger"
                            disabled={deletingId === r.id}
                            onClick={() => handleDelete(r)}
                          >
                            {deletingId === r.id ? "…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <p className="rf-results-count">
          Showing {filtered.length} of {raffles.length} raffles
        </p>
      )}

      {showCreate && canCreate && (
        <CreateRaffleModal
          events={availableEvents}
          poolByEvent={poolByEvent}
          onClose={() => setShowCreate(false)}
          onCreated={(newId) => {
            setShowCreate(false);
            router.push(`${detailHrefBase}/${newId}`);
          }}
        />
      )}
    </div>
  );
}

// ======================================================
// Status pill
// ======================================================

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "drawn"
      ? "rf-pill rf-pill-drawn"
      : "rf-pill rf-pill-draft";
  return <span className={cls}>{statusLabel(status)}</span>;
}

// ======================================================
// Create modal
// ======================================================

function CreateRaffleModal({
  events,
  poolByEvent,
  onClose,
  onCreated,
}: {
  events: EventOption[];
  poolByEvent: Record<number, number>;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [eventId, setEventId] = useState<string>(
    events[0] ? String(events[0].id) : ""
  );
  const [name, setName] = useState("");
  const [winnerCount, setWinnerCount] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedPool = eventId ? poolByEvent[Number(eventId)] ?? 0 : 0;
  const requestedCount = Number(winnerCount) || 0;
  const willCap = requestedCount > selectedPool && selectedPool > 0;
  const noPool = selectedPool === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!eventId) {
      setError("Please select an event");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a raffle name");
      return;
    }
    if (trimmedName.length > 128) {
      setError("Name must be 128 characters or fewer");
      return;
    }
    const count = Number(winnerCount);
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setError("Winner count must be a whole number between 1 and 500");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: Number(eventId),
          name: trimmedName,
          winnerCount: count,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | ApiCreateResponse
        | { error?: string }
        | null;

      if (!res.ok) {
        setError(
          (body as { error?: string } | null)?.error ||
            "Failed to create raffle"
        );
        return;
      }

      onCreated((body as ApiCreateResponse).raffle.id);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rf-modal-overlay"
      onClick={() => !saving && onClose()}
    >
      <div
        className="rf-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rf-modal-header">
          <h2 className="rf-modal-title">New Raffle</h2>
          <button
            className="rf-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="rf-modal-body">
          {error && <div className="rf-modal-error">{error}</div>}

          <label className="rf-field">
            <span className="rf-field-label">
              Event <span className="rf-required">*</span>
            </span>
            <select
              className="rf-input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">— Select an event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({poolByEvent[ev.id] ?? 0} in pool)
                </option>
              ))}
            </select>
            <span className="rf-field-hint">
              Only events with at least one paid customer are shown.
            </span>
          </label>

          <label className="rf-field">
            <span className="rf-field-label">
              Raffle name <span className="rf-required">*</span>
            </span>
            <input
              type="text"
              className="rf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grand Prize Draw, Opening Night Raffle"
              maxLength={128}
            />
          </label>

          <label className="rf-field">
            <span className="rf-field-label">
              Number of winners <span className="rf-required">*</span>
            </span>
            <input
              type="number"
              className="rf-input"
              value={winnerCount}
              onChange={(e) => setWinnerCount(e.target.value)}
              min={1}
              max={500}
              step={1}
            />
            <span className="rf-field-hint">
              At draw time, this caps at the actual pool size.
            </span>
          </label>

          <div
            className={`rf-pool-summary ${
              noPool
                ? "rf-pool-summary-danger"
                : willCap
                ? "rf-pool-summary-warn"
                : "rf-pool-summary-ok"
            }`}
          >
            <div className="rf-pool-summary-row">
              <span className="rf-pool-summary-label">Pool size</span>
              <span className="rf-pool-summary-value">
                {selectedPool}{" "}
                {selectedPool === 1 ? "customer" : "customers"}
              </span>
            </div>
            {noPool ? (
              <div className="rf-pool-summary-note">
                No paid customers for this event yet. You can still create
                the raffle — the draw will fail until someone pays.
              </div>
            ) : willCap ? (
              <div className="rf-pool-summary-note">
                You requested {requestedCount} winners but only {selectedPool}{" "}
                are eligible. The draw will cap at {selectedPool}.
              </div>
            ) : (
              <div className="rf-pool-summary-note">
                {requestedCount} of {selectedPool} eligible customers will be
                picked.
              </div>
            )}
          </div>

          <div className="rf-modal-actions">
            <button
              type="button"
              className="rf-btn rf-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rf-btn rf-btn-primary"
              disabled={saving}
            >
              {saving ? "Creating…" : "Create raffle"}
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

function TrophyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}