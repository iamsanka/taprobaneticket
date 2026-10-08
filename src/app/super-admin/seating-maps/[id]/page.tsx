"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import "../SeatingMaps.css";

type SeatState = {
  id: number;
  rowLabel: string;
  rowOrder: number;
  numberLabel: number;
  isBlocked: boolean;
  isBooked: boolean;
  isHeld: boolean;
};

type Section = {
  id: number;
  label: string;
  rows: number;
  colsPerRow: number;
  displayOrder: number;
  colorHex: string | null;
  seats: SeatState[];
};

type MapPayload = {
  map: {
    id: number;
    eventId: number;
    categoryId: number;
    name: string;
    stagePosition: "top" | "bottom" | "none"; // ⭐
    createdAt: string;
    updatedAt: string;
  };
  event: { id: number; title: string } | null;
  category: { id: number; name: string } | null;
  sections: Section[];
};

export default function SeatingMapEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const mapId = Number(id);

  const [data, setData] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seatBusy, setSeatBusy] = useState<Record<number, boolean>>({});
  const [sectionBusy, setSectionBusy] = useState<Record<number, boolean>>({});

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [sectionLabelDraft, setSectionLabelDraft] = useState("");

  const [showAddSection, setShowAddSection] = useState(false);

  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => {
      setToast((t) => (t && t.msg === msg ? null : t));
    }, 2600);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const json = (await res.json()) as MapPayload;
      setData(json);
      setNameDraft(json.map.name);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [mapId]);

  useEffect(() => {
    if (Number.isInteger(mapId) && mapId > 0) load();
  }, [load, mapId]);

  async function toggleSeat(seat: SeatState) {
    if (!data) return;
    if (seat.isBooked) {
      showToast("err", "This seat is booked — cannot block it.");
      return;
    }
    if (seat.isHeld) {
      showToast("err", "A customer is currently holding this seat. Try later.");
      return;
    }
    if (seatBusy[seat.id]) return;

    const nextBlocked = !seat.isBlocked;

    setData((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((sec) => ({
              ...sec,
              seats: sec.seats.map((s) =>
                s.id === seat.id ? { ...s, isBlocked: nextBlocked } : s
              ),
            })),
          }
        : prev
    );
    setSeatBusy((b) => ({ ...b, [seat.id]: true }));

    try {
      const res = await fetch(
        `/api/super-admin/seating-maps/${mapId}/seats/${seat.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isBlocked: nextBlocked }),
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                sections: prev.sections.map((sec) => ({
                  ...sec,
                  seats: sec.seats.map((s) =>
                    s.id === seat.id
                      ? { ...s, isBlocked: seat.isBlocked }
                      : s
                  ),
                })),
              }
            : prev
        );
        showToast("err", body?.error || "Failed to update seat");
      }
    } catch (err) {
      console.error(err);
      setData((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((sec) => ({
                ...sec,
                seats: sec.seats.map((s) =>
                  s.id === seat.id ? { ...s, isBlocked: seat.isBlocked } : s
                ),
              })),
            }
          : prev
      );
      showToast("err", "Network error");
    } finally {
      setSeatBusy((b) => {
        const next = { ...b };
        delete next[seat.id];
        return next;
      });
    }
  }

  async function saveMapName() {
    if (!data) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      showToast("err", "Map name cannot be empty");
      return;
    }
    if (trimmed === data.map.name) {
      setEditingName(false);
      return;
    }

    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "rename", name: trimmed }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showToast("err", body?.error || "Failed to rename map");
        return;
      }
      setData((prev) =>
        prev ? { ...prev, map: { ...prev.map, name: trimmed } } : prev
      );
      setEditingName(false);
      showToast("ok", "Map name updated");
    } catch (err) {
      console.error(err);
      showToast("err", "Network error");
    }
  }

  // ⭐ NEW — set stage position
  async function handleStageChange(next: "top" | "bottom" | "none") {
    if (!data) return;
    const prevValue = data.map.stagePosition;

    // Optimistic
    setData((prev) =>
      prev ? { ...prev, map: { ...prev.map, stagePosition: next } } : prev
    );

    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "setStage", stagePosition: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // Roll back
        setData((prev) =>
          prev
            ? { ...prev, map: { ...prev.map, stagePosition: prevValue } }
            : prev
        );
        showToast("err", body?.error || "Failed to update stage");
        return;
      }
      showToast("ok", "Stage position updated");
    } catch (err) {
      console.error(err);
      setData((prev) =>
        prev
          ? { ...prev, map: { ...prev.map, stagePosition: prevValue } }
          : prev
      );
      showToast("err", "Network error");
    }
  }

  async function handleRenameSection(sectionId: number) {
    if (!data) return;
    const label = sectionLabelDraft.trim();
    if (!label) {
      showToast("err", "Section label cannot be empty");
      return;
    }

    setSectionBusy((b) => ({ ...b, [sectionId]: true }));
    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "renameSection",
          sectionId,
          label,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showToast("err", body?.error || "Failed to rename section");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) =>
                s.id === sectionId ? { ...s, label } : s
              ),
            }
          : prev
      );
      setEditingSectionId(null);
      showToast("ok", "Section renamed");
    } catch (err) {
      console.error(err);
      showToast("err", "Network error");
    } finally {
      setSectionBusy((b) => {
        const next = { ...b };
        delete next[sectionId];
        return next;
      });
    }
  }

  async function handleRemoveSection(section: Section) {
    if (!data) return;

    const bookedCount = section.seats.filter((s) => s.isBooked).length;
    const heldCount = section.seats.filter((s) => s.isHeld).length;

    if (bookedCount > 0) {
      alert(
        `This section has ${bookedCount} booked ${
          bookedCount === 1 ? "seat" : "seats"
        }.\n\nCancel or refund those orders before removing it.`
      );
      return;
    }
    if (heldCount > 0) {
      alert(
        `This section has ${heldCount} active ${
          heldCount === 1 ? "hold" : "holds"
        }.\n\nA customer is currently checking out. Try again in a few minutes.`
      );
      return;
    }

    const ok = window.confirm(
      `Remove section "${section.label}" and its ${section.seats.length} ${
        section.seats.length === 1 ? "seat" : "seats"
      }?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setSectionBusy((b) => ({ ...b, [section.id]: true }));
    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "removeSection",
          sectionId: section.id,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showToast("err", body?.error || "Failed to remove section");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.filter((s) => s.id !== section.id),
            }
          : prev
      );
      showToast("ok", `Section "${section.label}" removed`);
    } catch (err) {
      console.error(err);
      showToast("err", "Network error");
    } finally {
      setSectionBusy((b) => {
        const next = { ...b };
        delete next[section.id];
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="sm-page">
        <div className="sm-state">
          <div className="sm-state-spinner" />
          <p className="sm-state-text">Loading seating map…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sm-page">
        <Link href="/super-admin/seating-maps" className="sm-back">
          <ArrowLeftIcon />
          Back to Seating Maps
        </Link>
        <div className="sm-error">{error || "Map not found"}</div>
      </div>
    );
  }

  const totalSeats = data.sections.reduce(
    (sum, s) => sum + s.seats.length,
    0
  );
  const bookedSeats = data.sections.reduce(
    (sum, s) => sum + s.seats.filter((x) => x.isBooked).length,
    0
  );
  const blockedSeats = data.sections.reduce(
    (sum, s) => sum + s.seats.filter((x) => x.isBlocked).length,
    0
  );

  return (
    <div className="sm-page">
      <Link href="/super-admin/seating-maps" className="sm-back">
        <ArrowLeftIcon />
        Back to Seating Maps
      </Link>

      <header className="sm-detail-header">
        <div className="sm-detail-title-block">
          <span className="sm-eyebrow">Seating Map</span>
          {editingName ? (
            <div className="sm-name-edit">
              <input
                className="sm-input sm-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                maxLength={128}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveMapName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameDraft(data.map.name);
                  }
                }}
              />
              <button
                className="sm-btn sm-btn-primary"
                onClick={saveMapName}
              >
                Save
              </button>
              <button
                className="sm-btn sm-btn-ghost"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(data.map.name);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="sm-detail-title">
              {data.map.name}
              <button
                className="sm-edit-pencil"
                onClick={() => setEditingName(true)}
                title="Rename map"
                aria-label="Rename map"
              >
                <PencilIcon />
              </button>
            </h1>
          )}

          <p className="sm-detail-subtitle">
            {data.event?.title ?? "—"} · {data.category?.name ?? "—"}
          </p>

          {/* ⭐ Stage selector */}
          <div className="sm-detail-stage">
            <label className="sm-stage-label" htmlFor="sm-stage-select">
              Stage
            </label>
            <select
              id="sm-stage-select"
              className="sm-stage-select"
              value={data.map.stagePosition}
              onChange={(e) =>
                handleStageChange(
                  e.target.value as "top" | "bottom" | "none"
                )
              }
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        <div className="sm-detail-stats">
          <span className="sm-stat">
            <strong>{data.sections.length}</strong>{" "}
            {data.sections.length === 1 ? "section" : "sections"}
          </span>
          <span className="sm-stat">
            <strong>{totalSeats}</strong> seats
          </span>
          {blockedSeats > 0 && (
            <span className="sm-stat sm-stat-blocked">
              <strong>{blockedSeats}</strong> blocked
            </span>
          )}
          {bookedSeats > 0 && (
            <span className="sm-stat sm-stat-booked">
              <strong>{bookedSeats}</strong> booked
            </span>
          )}
        </div>
      </header>

      <section className="sm-legend">
        <span className="sm-legend-item">
          <span className="sm-legend-swatch sm-swatch-available" />
          Available
        </span>
        <span className="sm-legend-item">
          <span className="sm-legend-swatch sm-swatch-blocked" />
          Blocked
        </span>
        <span className="sm-legend-item">
          <span className="sm-legend-swatch sm-swatch-held" />
          Held (checkout)
        </span>
        <span className="sm-legend-item">
          <span className="sm-legend-swatch sm-swatch-booked" />
          Booked
        </span>
        <span className="sm-legend-hint">
          Click any available or blocked seat to toggle it.
        </span>
      </section>

      {/* ⭐ Stage preview — top */}
      {data.map.stagePosition === "top" && (
        <div className="sm-stage-preview">
          <span className="sm-stage-text">STAGE</span>
          <span className="sm-stage-arrow">▼</span>
        </div>
      )}

      {data.sections.length === 0 ? (
        <div className="sm-state">
          <div className="sm-state-icon">
            <GridIcon />
          </div>
          <p className="sm-state-title">No sections yet</p>
          <p className="sm-state-text">
            Add a section to start laying out seats.
          </p>
        </div>
      ) : (
        data.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            busy={!!sectionBusy[section.id]}
            editing={editingSectionId === section.id}
            labelDraft={sectionLabelDraft}
            onStartEdit={() => {
              setEditingSectionId(section.id);
              setSectionLabelDraft(section.label);
            }}
            onCancelEdit={() => setEditingSectionId(null)}
            onChangeLabel={setSectionLabelDraft}
            onSaveLabel={() => handleRenameSection(section.id)}
            onRemove={() => handleRemoveSection(section)}
            seatBusy={seatBusy}
            onSeatClick={toggleSeat}
            multiSection={data.sections.length > 1}
          />
        ))
      )}

      {/* ⭐ Stage preview — bottom */}
      {data.map.stagePosition === "bottom" && (
        <div className="sm-stage-preview">
          <span className="sm-stage-arrow">▲</span>
          <span className="sm-stage-text">STAGE</span>
        </div>
      )}

      <div className="sm-add-section-wrap">
        <button
          className="sm-add-section-btn"
          onClick={() => setShowAddSection(true)}
        >
          <PlusIcon />
          Add Section
        </button>
      </div>

      {showAddSection && (
        <AddSectionModal
          mapId={mapId}
          existingLabels={data.sections.map((s) => s.label)}
          onClose={() => setShowAddSection(false)}
          onCreated={(newSection) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    sections: [...prev.sections, { ...newSection, seats: [] }],
                  }
                : prev
            );
            setShowAddSection(false);
            showToast("ok", `Section "${newSection.label}" added`);
            load();
          }}
        />
      )}

      {toast && (
        <div
          className={`sm-toast ${
            toast.kind === "ok" ? "sm-toast-ok" : "sm-toast-err"
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ======================================================
// Section block
// ======================================================

function SectionBlock({
  section,
  busy,
  editing,
  labelDraft,
  onStartEdit,
  onCancelEdit,
  onChangeLabel,
  onSaveLabel,
  onRemove,
  seatBusy,
  onSeatClick,
  multiSection,
}: {
  section: Section;
  busy: boolean;
  editing: boolean;
  labelDraft: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeLabel: (v: string) => void;
  onSaveLabel: () => void;
  onRemove: () => void;
  seatBusy: Record<number, boolean>;
  onSeatClick: (seat: SeatState) => void;
  multiSection: boolean;
}) {
  const bookedCount = section.seats.filter((s) => s.isBooked).length;

  const seatsByRow = useMemo(() => {
    const map = new Map<number, SeatState[]>();
    for (const seat of section.seats) {
      const arr = map.get(seat.rowOrder) ?? [];
      arr.push(seat);
      map.set(seat.rowOrder, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.numberLabel - b.numberLabel);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [section.seats]);

  return (
    <section className="sm-section">
      <header className="sm-section-header">
        <div className="sm-section-title-block">
          {editing ? (
            <div className="sm-section-edit">
              <input
                className="sm-input sm-section-label-input"
                value={labelDraft}
                onChange={(e) => onChangeLabel(e.target.value)}
                maxLength={64}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveLabel();
                  if (e.key === "Escape") onCancelEdit();
                }}
              />
              <button
                className="sm-btn sm-btn-primary sm-btn-sm"
                onClick={onSaveLabel}
                disabled={busy}
              >
                {busy ? "…" : "Save"}
              </button>
              <button
                className="sm-btn sm-btn-ghost sm-btn-sm"
                onClick={onCancelEdit}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h2 className="sm-section-title">
              {section.label}
              <button
                className="sm-edit-pencil"
                onClick={onStartEdit}
                title="Rename section"
                aria-label="Rename section"
              >
                <PencilIcon />
              </button>
            </h2>
          )}
          <p className="sm-section-meta">
            {section.rows} rows × {section.colsPerRow} cols ·{" "}
            {section.seats.length} seats
            {bookedCount > 0 && (
              <>
                {" · "}
                <span className="sm-count-booked">
                  {bookedCount} booked
                </span>
              </>
            )}
          </p>
        </div>

        <button
          className="sm-section-remove-btn"
          onClick={onRemove}
          disabled={busy}
          title="Remove this section"
        >
          {busy ? "…" : "Remove section"}
        </button>
      </header>

      <div className="sm-grid-wrap">
        {seatsByRow.map(([rowOrder, seatsInRow]) => {
          const rowLabel = seatsInRow[0]?.rowLabel ?? "";
          return (
            <div className="sm-grid-row" key={rowOrder}>
              <span className="sm-grid-row-label">{rowLabel}</span>
              <div className="sm-grid-seats">
                {seatsInRow.map((seat) => (
                  <Seat
                    key={seat.id}
                    seat={seat}
                    busy={!!seatBusy[seat.id]}
                    onClick={() => onSeatClick(seat)}
                    showSectionPrefix={false}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Seat({
  seat,
  busy,
  onClick,
  showSectionPrefix,
}: {
  seat: SeatState;
  busy: boolean;
  onClick: () => void;
  showSectionPrefix: boolean;
}) {
  const state = seat.isBooked
    ? "booked"
    : seat.isHeld
    ? "held"
    : seat.isBlocked
    ? "blocked"
    : "available";

  const title = seat.isBooked
    ? `Seat ${seat.rowLabel}${seat.numberLabel} — booked`
    : seat.isHeld
    ? `Seat ${seat.rowLabel}${seat.numberLabel} — held by a customer`
    : seat.isBlocked
    ? `Seat ${seat.rowLabel}${seat.numberLabel} — blocked (click to unblock)`
    : `Seat ${seat.rowLabel}${seat.numberLabel} — click to block`;

  const clickable = !seat.isBooked && !seat.isHeld;

  return (
    <button
      type="button"
      className={`sm-seat sm-seat-${state} ${
        busy ? "sm-seat-busy" : ""
      }`}
      onClick={clickable ? onClick : undefined}
      disabled={!clickable || busy}
      title={title}
      aria-label={title}
    >
      {seat.numberLabel}
    </button>
  );
}

// ======================================================
// Add section modal
// ======================================================

function AddSectionModal({
  mapId,
  existingLabels,
  onClose,
  onCreated,
}: {
  mapId: number;
  existingLabels: string[];
  onClose: () => void;
  onCreated: (section: {
    id: number;
    label: string;
    rows: number;
    colsPerRow: number;
    displayOrder: number;
    colorHex: string | null;
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState("10");
  const [colsPerRow, setColsPerRow] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = label.trim();
    if (!trimmed) {
      setError("Label is required");
      return;
    }
    if (
      existingLabels.some(
        (l) => l.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setError("A section with this label already exists");
      return;
    }

    const r = Number(rows);
    const c = Number(colsPerRow);
    if (!Number.isInteger(r) || r < 1 || r > 200) {
      setError("Rows must be a whole number between 1 and 200");
      return;
    }
    if (!Number.isInteger(c) || c < 1 || c > 200) {
      setError("Columns must be a whole number between 1 and 200");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/seating-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "addSection",
          label: trimmed,
          rows: r,
          colsPerRow: c,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || "Failed to add section");
        return;
      }
      onCreated(body.section);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sm-modal-overlay" onClick={() => !saving && onClose()}>
      <div className="sm-modal sm-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">Add Section</h2>
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
              Section label <span className="sm-required">*</span>
            </span>
            <input
              type="text"
              className="sm-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Left, Center, Right"
              maxLength={64}
              autoFocus
            />
            <span className="sm-field-hint">
              Appears as a prefix on seat labels (e.g. Left-A1).
            </span>
          </label>

          <div className="sm-field sm-field-inline">
            <label className="sm-field-half">
              <span className="sm-field-label">
                Rows <span className="sm-required">*</span>
              </span>
              <input
                type="number"
                className="sm-input"
                value={rows}
                onChange={(e) => setRows(e.target.value)}
                min={1}
                max={200}
              />
            </label>
            <label className="sm-field-half">
              <span className="sm-field-label">
                Columns <span className="sm-required">*</span>
              </span>
              <input
                type="number"
                className="sm-input"
                value={colsPerRow}
                onChange={(e) => setColsPerRow(e.target.value)}
                min={1}
                max={200}
              />
            </label>
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
              {saving ? "Adding…" : "Add section"}
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

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
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