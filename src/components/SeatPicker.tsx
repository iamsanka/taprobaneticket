"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./SeatPicker.css";

// ======================================================
// Types
// ======================================================

type SeatState = "available" | "blocked" | "held" | "booked";

type SeatFromApi = {
  id: number;
  rowLabel: string;
  numberLabel: number;
  state: SeatState;
  label: string;
};

type SectionFromApi = {
  id: number;
  label: string;
  rows: number;
  colsPerRow: number;
  displayOrder: number;
  colorHex: string | null;
  seats: SeatFromApi[];
};

type AvailabilityResponse =
  | { hasSeating: false }
  | {
      hasSeating: true;
      map: {
        id: number;
        name: string;
        stagePosition: "top" | "bottom" | "none"; // ⭐
        sections: SectionFromApi[];
      };
    };

export type SeatSelection = {
  token: string;
  seatIds: number[];
  seats: { id: number; label: string }[];
  expiresAt: string;
};

type SeatPickerProps = {
  eventId: number;
  categoryId: number;
  categoryName: string;
  expectedCount: number;
  resume?: SeatSelection | null;
  onChange: (selection: SeatSelection | null) => void;
  onConfirm: (selection: SeatSelection) => void;
  onClose: () => void;
};

// ======================================================
// Constants
// ======================================================

const AVAILABILITY_POLL_MS = 10_000;

// ======================================================
// Component
// ======================================================

export default function SeatPicker({
  eventId,
  categoryId,
  categoryName,
  expectedCount,
  resume,
  onChange,
  onConfirm,
  onClose,
}: SeatPickerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSeating, setHasSeating] = useState<boolean | null>(null);
  const [sections, setSections] = useState<SectionFromApi[]>([]);
  const [mapName, setMapName] = useState("");
  // ⭐ NEW — stage position
  const [stagePosition, setStagePosition] = useState<
    "top" | "bottom" | "none"
  >("none");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(resume?.seatIds ?? [])
  );
  const [token, setToken] = useState<string | null>(resume?.token ?? null);
  const [expiresAt, setExpiresAt] = useState<number | null>(
    resume?.expiresAt ? new Date(resume.expiresAt).getTime() : null
  );

  const [busySeatIds, setBusySeatIds] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // --------------------------------------------------
  // Load availability
  // --------------------------------------------------
  const loadAvailability = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/public/seats/availability?eventId=${eventId}&categoryId=${categoryId}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setError(`Failed to load seats (${res.status})`);
        return;
      }
      const data = (await res.json()) as AvailabilityResponse;

      if (!data.hasSeating) {
        setHasSeating(false);
        setSections([]);
        return;
      }

      setHasSeating(true);
      setMapName(data.map.name);
      setSections(data.map.sections);
      setStagePosition(data.map.stagePosition ?? "none"); // ⭐
    } catch (err) {
      console.error(err);
      setError("Network error");
    }
  }, [eventId, categoryId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAvailability();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAvailability]);

  // Resume
  useEffect(() => {
    if (loading || !resume || !resume.seatIds.length) return;
    let attempted = false;
    if (attempted) return;
    attempted = true;

    (async () => {
      try {
        const res = await fetch("/api/public/seats/hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            categoryId,
            seatIds: resume.seatIds,
            token: resume.token,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
          setExpiresAt(new Date(data.expiresAt).getTime());
          setSelectedIds(new Set(resume.seatIds));
          onChange({
            token: data.token,
            seatIds: resume.seatIds,
            seats: data.seats,
            expiresAt: data.expiresAt,
          });
        } else {
          setToken(null);
          setExpiresAt(null);
          setSelectedIds(new Set());
          onChange(null);
          await loadAvailability();
        }
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Poll
  useEffect(() => {
    if (loading || hasSeating !== true) return;
    const id = window.setInterval(() => {
      loadAvailability();
    }, AVAILABILITY_POLL_MS);
    return () => window.clearInterval(id);
  }, [loading, hasSeating, loadAvailability]);

  // Countdown
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  // Auto-expire
  useEffect(() => {
    if (!expiresAt) return;
    if (now >= expiresAt && selectedIds.size > 0) {
      setSelectedIds(new Set());
      setToken(null);
      setExpiresAt(null);
      onChange(null);
      loadAvailability();
    }
  }, [now, expiresAt, selectedIds.size, onChange, loadAvailability]);

  // Beacon on unload
  useEffect(() => {
    function handleUnload() {
      const t = tokenRef.current;
      if (!t) return;
      const body = JSON.stringify({ token: t });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/public/seats/release",
          new Blob([body], { type: "application/json" })
        );
      }
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Seat click
  async function handleSeatClick(seat: SeatFromApi) {
    if (seat.state !== "available" && !selectedIds.has(seat.id)) return;
    if (busySeatIds.has(seat.id)) return;

    const isSelected = selectedIds.has(seat.id);

    if (isSelected) {
      const newIds = new Set(selectedIds);
      newIds.delete(seat.id);
      setSelectedIds(newIds);
      setBusySeatIds((b) => new Set(b).add(seat.id));

      try {
        if (tokenRef.current) {
          await fetch("/api/public/seats/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: tokenRef.current,
              seatIds: [seat.id],
            }),
          });
        }
        if (newIds.size === 0) {
          setToken(null);
          setExpiresAt(null);
          onChange(null);
        } else if (tokenRef.current && expiresAt) {
          const seats = collectSelectedSeats(newIds, sections);
          onChange({
            token: tokenRef.current,
            seatIds: Array.from(newIds),
            seats,
            expiresAt: new Date(expiresAt).toISOString(),
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setBusySeatIds((b) => {
          const n = new Set(b);
          n.delete(seat.id);
          return n;
        });
      }
      return;
    }

    const newIds = new Set(selectedIds);
    newIds.add(seat.id);
    setSelectedIds(newIds);
    setBusySeatIds((b) => new Set(b).add(seat.id));

    try {
      const res = await fetch("/api/public/seats/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          categoryId,
          seatIds: Array.from(newIds),
          token: tokenRef.current ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const rolledBack = new Set(selectedIds);
        setSelectedIds(rolledBack);
        alert(
          body?.error ||
            "That seat is no longer available. Please try another."
        );
        await loadAvailability();
        return;
      }

      const data = await res.json();
      setToken(data.token);
      setExpiresAt(new Date(data.expiresAt).getTime());
      onChange({
        token: data.token,
        seatIds: Array.from(newIds),
        seats: data.seats,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      console.error(err);
      setSelectedIds(new Set(selectedIds));
      alert("Network error — please try again");
    } finally {
      setBusySeatIds((b) => {
        const n = new Set(b);
        n.delete(seat.id);
        return n;
      });
    }
  }

  function handleClose() {
    const t = tokenRef.current;
    if (t) {
      fetch("/api/public/seats/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
        keepalive: true,
      }).catch(() => {});
    }
    onChange(null);
    onClose();
  }

  function handleConfirm() {
    if (!token || !expiresAt) return;
    if (selectedIds.size !== expectedCount) return;
    const seats = collectSelectedSeats(selectedIds, sections);
    onConfirm({
      token,
      seatIds: Array.from(selectedIds),
      seats,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  const selectedCount = selectedIds.size;
  const canConfirm =
    selectedCount === expectedCount && token !== null && expiresAt !== null;

  const secondsLeft = expiresAt
    ? Math.max(0, Math.floor((expiresAt - now) / 1000))
    : 0;
  const minutesLeft = Math.floor(secondsLeft / 60);
  const secsLeft = secondsLeft % 60;
  const timerLabel = `${minutesLeft}:${String(secsLeft).padStart(2, "0")}`;

  return (
    <div className="sp-overlay" onClick={handleClose}>
      <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
        <header className="sp-header">
          <div>
            <span className="sp-eyebrow">Select your seats</span>
            <h2 className="sp-title">{categoryName}</h2>
            <p className="sp-subtitle">
              {selectedCount} of {expectedCount}{" "}
              {expectedCount === 1 ? "seat" : "seats"} selected
              {expiresAt !== null && selectedCount > 0 && (
                <>
                  {" · "}
                  <span
                    className={`sp-timer ${
                      secondsLeft < 60 ? "sp-timer-warn" : ""
                    }`}
                  >
                    Held for {timerLabel}
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            className="sp-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="sp-body">
          {loading && (
            <div className="sp-state">
              <div className="sp-spinner" />
              <p>Loading seat map…</p>
            </div>
          )}

          {error && <div className="sp-error">{error}</div>}

          {!loading && hasSeating === false && (
            <div className="sp-state">
              <p className="sp-state-title">
                No seat selection required
              </p>
              <p className="sp-state-text">
                This ticket type does not require seat selection.
              </p>
            </div>
          )}

          {!loading && hasSeating === true && (
            <>
              <div className="sp-legend">
                <span className="sp-legend-item">
                  <span className="sp-swatch sp-swatch-available" /> Available
                </span>
                <span className="sp-legend-item">
                  <span className="sp-swatch sp-swatch-selected" /> Selected
                </span>
                <span className="sp-legend-item">
                  <span className="sp-swatch sp-swatch-taken" /> Taken
                </span>
              </div>

              {/* ⭐ Stage banner — top */}
              {stagePosition === "top" && (
                <div className="sp-stage sp-stage-top">
                  <span className="sp-stage-text">STAGE</span>
                  <span className="sp-stage-arrow">▼</span>
                </div>
              )}

              <div className="sp-sections">
                {sections.map((section) => (
                  <SeatGrid
                    key={section.id}
                    section={section}
                    selectedIds={selectedIds}
                    busySeatIds={busySeatIds}
                    onSeatClick={handleSeatClick}
                    multiSection={sections.length > 1}
                  />
                ))}
              </div>

              {/* ⭐ Stage banner — bottom */}
              {stagePosition === "bottom" && (
                <div className="sp-stage sp-stage-bottom">
                  <span className="sp-stage-arrow">▲</span>
                  <span className="sp-stage-text">STAGE</span>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="sp-footer">
          <button className="sp-btn sp-btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="sp-btn sp-btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {selectedCount === 0
              ? `Select ${expectedCount} ${
                  expectedCount === 1 ? "seat" : "seats"
                }`
              : selectedCount < expectedCount
              ? `Select ${expectedCount - selectedCount} more`
              : `Confirm ${selectedCount} ${
                  selectedCount === 1 ? "seat" : "seats"
                }`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ======================================================
// Seat grid
// ======================================================

function SeatGrid({
  section,
  selectedIds,
  busySeatIds,
  onSeatClick,
  multiSection,
}: {
  section: SectionFromApi;
  selectedIds: Set<number>;
  busySeatIds: Set<number>;
  onSeatClick: (seat: SeatFromApi) => void;
  multiSection: boolean;
}) {
  const seatsByRow = useMemo(() => {
    const groupMap = new Map<string, SeatFromApi[]>();
    for (const seat of section.seats) {
      const arr = groupMap.get(seat.rowLabel) ?? [];
      arr.push(seat);
      groupMap.set(seat.rowLabel, arr);
    }
    for (const arr of groupMap.values()) {
      arr.sort((a, b) => a.numberLabel - b.numberLabel);
    }
    const rows = Array.from(groupMap.entries()).sort(([a], [b]) =>
      rowLetterToNumber(a) - rowLetterToNumber(b)
    );
    return rows;
  }, [section.seats]);

  return (
    <div className="sp-section">
      {multiSection && (
        <h3 className="sp-section-title">{section.label}</h3>
      )}
      <div className="sp-grid-wrap">
        {seatsByRow.map(([rowLabel, seatsInRow]) => (
          <div className="sp-grid-row" key={rowLabel}>
            <span className="sp-row-label">{rowLabel}</span>
            <div className="sp-row-seats">
              {seatsInRow.map((seat) => {
                const isSelected = selectedIds.has(seat.id);
                const isBusy = busySeatIds.has(seat.id);
                const isAvailable = seat.state === "available";
                const clickable = isAvailable || isSelected;

                const cls = isSelected
                  ? "sp-seat sp-seat-selected"
                  : seat.state === "booked"
                  ? "sp-seat sp-seat-booked"
                  : seat.state === "held"
                  ? "sp-seat sp-seat-held"
                  : seat.state === "blocked"
                  ? "sp-seat sp-seat-blocked"
                  : "sp-seat sp-seat-available";

                const title = isSelected
                  ? `${seat.label} — selected (click to remove)`
                  : seat.state === "available"
                  ? `${seat.label} — click to select`
                  : seat.state === "booked"
                  ? `${seat.label} — already booked`
                  : seat.state === "held"
                  ? `${seat.label} — someone else is choosing this seat`
                  : `${seat.label} — unavailable`;

                return (
                  <button
                    key={seat.id}
                    type="button"
                    className={`${cls} ${isBusy ? "sp-seat-busy" : ""}`}
                    onClick={
                      clickable ? () => onSeatClick(seat) : undefined
                    }
                    disabled={!clickable || isBusy}
                    title={title}
                    aria-label={title}
                    aria-pressed={isSelected}
                  >
                    {seat.numberLabel}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================================================
// Helpers
// ======================================================

function rowLetterToNumber(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result;
}

function collectSelectedSeats(
  selectedIds: Set<number>,
  sections: SectionFromApi[]
): { id: number; label: string }[] {
  const lookup = new Map<number, string>();
  for (const sec of sections) {
    for (const seat of sec.seats) {
      lookup.set(seat.id, seat.label);
    }
  }
  return Array.from(selectedIds).map((id) => ({
    id,
    label: lookup.get(id) ?? `#${id}`,
  }));
}