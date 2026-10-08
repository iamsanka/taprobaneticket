"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import "../Raffles.css";

// ======================================================
// Types
// ======================================================

type Winner = {
  id: number;
  position: number;
  customerEmail: string;
  customerName: string | null;
  orderId: number | null;
  createdAt: string;
};

type RaffleDetail = {
  raffle: {
    id: number;
    eventId: number;
    name: string;
    winnerCount: number;
    status: string;
    drawnAt: string | null;
    drawnBy: number | null;
    drawnByEmail: string | null;
    createdBy: number;
    createdByEmail: string | null;
    createdAt: string;
    updatedAt: string;
  };
  event: { id: number; title: string } | null;
  winners: Winner[];
  poolSize: number;
  poolPreview: { customerEmail: string; customerName: string | null }[];
};

type DrawResponse = {
  raffle: {
    id: number;
    name: string;
    eventId: number;
    winnerCount: number;
    status: string;
    drawnAt: string;
    drawnBy: number;
  };
  winners: Winner[];
  poolSize: number;
  requestedWinners: number;
  actualWinners: number;
  cappedAtPool: boolean;
};

// Reveal phase state machine
type Phase = "idle" | "drawing" | "revealing" | "finale";

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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const localMasked =
    local.length <= 2
      ? local[0] + "***"
      : local[0] + "***" + local[local.length - 1];
  return `${localMasked}@${domain}`;
}

// ⭐ Confetti bursts — bigger for top 3
function fireConfetti(position: number, totalWinners: number) {
  const isTop3 = position <= 3;
  const isTop1 = position === 1;

  if (isTop1) {
    // Huge celebration for the top prize
    const duration = 2500;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
        colors: ["#2a8bc4", "#e07a56", "#d4af37", "#eddfa9", "#ffffff"],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
        colors: ["#2a8bc4", "#e07a56", "#d4af37", "#eddfa9", "#ffffff"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();

    // Opening burst
    confetti({
      particleCount: 180,
      spread: 100,
      origin: { y: 0.6 },
      colors: ["#2a8bc4", "#e07a56", "#d4af37", "#eddfa9"],
    });
  } else if (isTop3) {
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#2a8bc4", "#d4af37", "#eddfa9"],
    });
  } else {
    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#2a8bc4", "#4fb6e0"],
    });
  }

  void totalWinners;
}

// ======================================================
// Page
// ======================================================

export default function RaffleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const raffleId = Number(id);

  const [data, setData] = useState<RaffleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Draw / reveal state
  const [phase, setPhase] = useState<Phase>("idle");
  const [drawing, setDrawing] = useState(false);
  const [liveWinners, setLiveWinners] = useState<Winner[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [cappedAtPool, setCappedAtPool] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );

  const revealTimeoutRef = useRef<number | null>(null);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => {
      setToast((t) => (t && t.msg === msg ? null : t));
    }, 2800);
  }

  // ---- Load ----
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/raffles/${raffleId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to load (${res.status})`);
        return;
      }
      const json = (await res.json()) as RaffleDetail;
      setData(json);
      // If the raffle is already drawn, prep the reveal with existing winners
      if (json.winners.length > 0) {
        setLiveWinners(json.winners);
      }
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [raffleId]);

  useEffect(() => {
    if (Number.isInteger(raffleId) && raffleId > 0) load();
  }, [load, raffleId]);

  // ---- Cleanup timeouts on unmount ----
  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  // ---- Draw ----
  async function handleDraw() {
    if (!data) return;

    const isRedraw = data.raffle.status === "drawn";
    const pool = data.poolSize;
    if (pool === 0) {
      showToast(
        "err",
        "No paid customers for this event yet. The raffle needs at least one."
      );
      return;
    }

    const requested = data.raffle.winnerCount;
    const actual = Math.min(requested, pool);
    const capNote =
      actual < requested
        ? `\n\nOnly ${pool} ${
            pool === 1 ? "customer is" : "customers are"
          } eligible — the draw will cap at ${actual}.`
        : "";

    const confirmMsg = isRedraw
      ? `⚠️ This raffle has already been drawn.\n\nRedrawing will replace the current winners with a new random set. The previous winners will be lost.\n\nContinue?${capNote}`
      : `Draw ${actual} ${
          actual === 1 ? "winner" : "winners"
        } from ${pool} eligible ${pool === 1 ? "customer" : "customers"}?${capNote}`;

    if (!window.confirm(confirmMsg)) return;

    setDrawing(true);
    setPhase("drawing");
    try {
      const res = await fetch(
        `/api/super-admin/raffles/${raffleId}/draw`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setPhase("idle");
        showToast("err", body?.error || "Failed to draw winners");
        return;
      }

      const draw = body as DrawResponse;
      // Sort winners position ascending (they should already be, but be safe)
      const sorted = [...draw.winners].sort(
        (a, b) => a.position - b.position
      );
      setLiveWinners(sorted);
      setCappedAtPool(draw.cappedAtPool);
      setRevealedCount(0);
      setPhase("revealing");

      // Refresh raffle meta (status, drawnAt, etc.)
      setData((prev) =>
        prev
          ? {
              ...prev,
              raffle: {
                ...prev.raffle,
                status: "drawn",
                drawnAt: draw.raffle.drawnAt,
              },
              winners: sorted,
            }
          : prev
      );
    } catch (err) {
      console.error(err);
      setPhase("idle");
      showToast("err", "Network error");
    } finally {
      setDrawing(false);
    }
  }

  // ---- Reveal sequence ----
  // Reveal order: last place first, top prize last.
  // winners[0] is position 1 (top), winners[N-1] is position N.
  // We reveal from index N-1 down to 0.
  function handleRevealNext() {
    if (!data) return;
    const total = liveWinners.length;
    if (total === 0) return;

    const nextIndex = total - 1 - revealedCount;
    if (nextIndex < 0) return;

    const winner = liveWinners[nextIndex];

    // Fire confetti for this reveal
    fireConfetti(winner.position, total);

    const newCount = revealedCount + 1;
    setRevealedCount(newCount);

    // If this was the last winner (position 1), show finale after a beat
    if (newCount >= total) {
      revealTimeoutRef.current = window.setTimeout(() => {
        setPhase("finale");
        // Extra big finale burst
        fireConfetti(1, total);
      }, 1800);
    }
  }

  // Reset the reveal back to the start (used when reopening reveal for an
  // already-drawn raffle)
  function startRevealFromScratch() {
    if (liveWinners.length === 0) return;
    setRevealedCount(0);
    setPhase("revealing");
  }

  function handleSkipToFinale() {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setRevealedCount(liveWinners.length);
    setPhase("finale");
    fireConfetti(1, liveWinners.length);
  }

  // ---- Derived ----
  const currentRevealWinner = useMemo(() => {
    if (!data || liveWinners.length === 0) return null;
    const total = liveWinners.length;
    const idx = total - 1 - revealedCount;
    if (idx < 0) return null;
    return liveWinners[idx];
  }, [data, liveWinners, revealedCount]);

  const totalWinners = liveWinners.length;
  const isDrawn = data?.raffle.status === "drawn";
  const poolSize = data?.poolSize ?? 0;

  // ---- Loading / error ----
  if (loading) {
    return (
      <div className="rf-page">
        <div className="rf-state">
          <div className="rf-state-spinner" />
          <p className="rf-state-text">Loading raffle…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rf-page">
        <Link href="/super-admin/raffles" className="rf-back">
          <ArrowLeftIcon />
          Back to Raffles
        </Link>
        <div className="rf-error">{error || "Raffle not found"}</div>
      </div>
    );
  }

  return (
    <div className="rf-page">
      <Link href="/super-admin/raffles" className="rf-back">
        <ArrowLeftIcon />
        Back to Raffles
      </Link>

      {/* ---- Header ---- */}
      <header className="rf-detail-header">
        <div className="rf-detail-title-block">
          <span className="rf-eyebrow">Raffle</span>
          <h1 className="rf-detail-title">{data.raffle.name}</h1>
          <p className="rf-detail-subtitle">
            {data.event?.title ?? "—"}
          </p>
        </div>

        <div className="rf-detail-stats">
          <span className="rf-stat">
            <strong>{data.raffle.winnerCount}</strong>{" "}
            {data.raffle.winnerCount === 1 ? "winner" : "winners"} requested
          </span>
          <span
            className={`rf-stat ${
              poolSize === 0 ? "rf-stat-warn" : ""
            }`}
          >
            <strong>{poolSize}</strong> in pool
          </span>
          <span
            className={`rf-stat ${
              isDrawn ? "rf-stat-drawn" : "rf-stat-draft"
            }`}
          >
            {isDrawn ? "Drawn" : "Draft"}
          </span>
        </div>
      </header>

      {/* ---- Info strip ---- */}
      <section className="rf-info-strip">
        <div className="rf-info-item">
          <span className="rf-info-label">Created by</span>
          <span className="rf-info-value">
            {data.raffle.createdByEmail ?? "—"}
          </span>
        </div>
        <div className="rf-info-item">
          <span className="rf-info-label">Created</span>
          <span className="rf-info-value">
            {formatDate(data.raffle.createdAt)}
          </span>
        </div>
        {isDrawn && (
          <>
            <div className="rf-info-item">
              <span className="rf-info-label">Drawn by</span>
              <span className="rf-info-value">
                {data.raffle.drawnByEmail ?? "—"}
              </span>
            </div>
            <div className="rf-info-item">
              <span className="rf-info-label">Drawn at</span>
              <span className="rf-info-value">
                {formatDate(data.raffle.drawnAt)}
              </span>
            </div>
          </>
        )}
      </section>

      {/* ---- Pool preview ---- */}
      {!isDrawn && (
        <section className="rf-card">
          <h2 className="rf-card-title">
            Eligible customers ({poolSize})
          </h2>
          {poolSize === 0 ? (
            <p className="rf-empty">
              No paid customers for this event yet. Once someone completes
              a purchase, they will enter the pool automatically.
            </p>
          ) : (
            <>
              <p className="rf-card-subtitle">
                A random sample of who is currently eligible. New paid orders
                are added automatically until the draw runs.
              </p>
              <div className="rf-pool-preview-grid">
                {data.poolPreview.map((c, i) => (
                  <div key={i} className="rf-pool-preview-item">
                    <div className="rf-pool-preview-name">
                      {c.customerName ?? "—"}
                    </div>
                    <div className="rf-pool-preview-email">
                      {maskEmail(c.customerEmail)}
                    </div>
                  </div>
                ))}
              </div>
              {poolSize > data.poolPreview.length && (
                <p className="rf-pool-more">
                  + {poolSize - data.poolPreview.length} more
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ---- Draw card ---- */}
      {!isDrawn && (
        <section className="rf-draw-card">
          <div className="rf-draw-icon">
            <DiceIcon />
          </div>
          <h2 className="rf-draw-title">
            Ready to draw the winners?
          </h2>
          <p className="rf-draw-text">
            {poolSize === 0
              ? "This raffle has no eligible customers yet."
              : `We will pick ${
                  Math.min(data.raffle.winnerCount, poolSize)
                } random ${
                  Math.min(data.raffle.winnerCount, poolSize) === 1
                    ? "winner"
                    : "winners"
                } from ${poolSize} eligible ${
                  poolSize === 1 ? "customer" : "customers"
                }.`}
            {data.raffle.winnerCount > poolSize && poolSize > 0 && (
              <span className="rf-draw-cap-note">
                {" "}
                Capped at pool size ({poolSize}).
              </span>
            )}
          </p>
          <button
            className="rf-draw-btn"
            onClick={handleDraw}
            disabled={drawing || poolSize === 0}
          >
            {drawing ? "Drawing…" : "Draw Winners"}
          </button>
        </section>
      )}

      {/* ---- Already drawn: show winner table + reveal button ---- */}
      {isDrawn && liveWinners.length > 0 && (
        <>
          {cappedAtPool && (
            <div className="rf-banner rf-banner-warn">
              ⚠️ The pool had fewer customers than requested winners, so the
              draw capped at {liveWinners.length}.
            </div>
          )}

          <section className="rf-card">
            <div className="rf-card-header">
              <h2 className="rf-card-title">
                Winners ({liveWinners.length})
              </h2>
              <div className="rf-card-actions">
                <button
                  className="rf-btn rf-btn-accent"
                  onClick={startRevealFromScratch}
                >
                  <PlayIcon />
                  Reveal winners
                </button>
                <button
                  className="rf-btn rf-btn-ghost"
                  onClick={handleDraw}
                  disabled={drawing || poolSize === 0}
                >
                  <RefreshIcon />
                  Redraw
                </button>
              </div>
            </div>

            <div className="rf-table-wrap">
              <table className="rf-table">
                <thead>
                  <tr>
                    <th className="rf-td-right">#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th className="rf-td-right">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {liveWinners
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((w) => (
                      <tr
                        key={w.id}
                        className={
                          w.position <= 3
                            ? `rf-row-top-${w.position}`
                            : ""
                        }
                      >
                        <td className="rf-td-right">
                          <span
                            className={`rf-pos-badge rf-pos-badge-${Math.min(
                              w.position,
                              4
                            )}`}
                          >
                            {w.position}
                          </span>
                        </td>
                        <td className="rf-td-strong">
                          {w.customerName ?? "—"}
                        </td>
                        <td className="rf-td-muted">{w.customerEmail}</td>
                        <td className="rf-td-right rf-td-muted">
                          {w.orderId ?? "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ============================================ */}
      {/* Reveal overlay                               */}
      {/* ============================================ */}
      {phase === "revealing" && currentRevealWinner && (
        <RevealOverlay
          winner={currentRevealWinner}
          revealedCount={revealedCount}
          totalWinners={totalWinners}
          onNext={handleRevealNext}
          onSkipToFinale={handleSkipToFinale}
        />
      )}

      {/* ============================================ */}
      {/* Finale overlay                               */}
      {/* ============================================ */}
      {phase === "finale" && liveWinners.length > 0 && (
        <FinaleOverlay
          winners={liveWinners}
          onClose={() => setPhase("idle")}
        />
      )}

      {/* ---- Toast ---- */}
      {toast && (
        <div
          className={`rf-toast ${
            toast.kind === "ok" ? "rf-toast-ok" : "rf-toast-err"
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
// Reveal overlay — one winner at a time, last to first
// ======================================================

function RevealOverlay({
  winner,
  revealedCount,
  totalWinners,
  onNext,
  onSkipToFinale,
}: {
  winner: Winner;
  revealedCount: number;
  totalWinners: number;
  onNext: () => void;
  onSkipToFinale: () => void;
}) {
  const isFinalReveal = revealedCount === totalWinners;
  const isTopThree = winner.position <= 3;

  return (
    <div className="rf-overlay">
      <div className="rf-reveal">
        {/* Progress dots */}
        <div className="rf-reveal-progress">
          {Array.from({ length: totalWinners }).map((_, i) => (
            <span
              key={i}
              className={`rf-reveal-dot ${
                i < revealedCount ? "rf-reveal-dot-done" : ""
              }`}
            />
          ))}
        </div>

        <div
          className={`rf-reveal-card ${
            isTopThree ? `rf-reveal-card-top rf-reveal-card-top-${winner.position}` : ""
          }`}
          key={winner.position}
        >
          <div className="rf-reveal-position">
            {winner.position === 1 && <CrownIcon />}
            {ordinal(winner.position)} Winner
          </div>

          <div className="rf-reveal-name">
            {winner.customerName ?? "Anonymous Customer"}
          </div>

          <div className="rf-reveal-email">{winner.customerEmail}</div>

          {winner.orderId && (
            <div className="rf-reveal-order">
              Order #{winner.orderId}
            </div>
          )}
        </div>

        <div className="rf-reveal-actions">
          <button
            className="rf-reveal-skip"
            onClick={onSkipToFinale}
          >
            Skip to finale
          </button>
          <button
            className="rf-reveal-next"
            onClick={onNext}
            disabled={isFinalReveal}
          >
            {isFinalReveal ? "Revealing all…" : "Next winner"}
            {!isFinalReveal && <ArrowRightIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// Finale overlay — podium + full winner grid
// ======================================================

function FinaleOverlay({
  winners,
  onClose,
}: {
  winners: Winner[];
  onClose: () => void;
}) {
  const sorted = [...winners].sort((a, b) => a.position - b.position);
  const top1 = sorted[0];
  const top2 = sorted[1];
  const top3 = sorted[2];
  const rest = sorted.slice(3);

  const has3 = !!top3;
  const has2 = !!top2;

  return (
    <div className="rf-overlay rf-overlay-finale">
      <div className="rf-finale">
        <div className="rf-finale-header">
          <span className="rf-finale-eyebrow">🎉 Raffle Complete</span>
          <h2 className="rf-finale-title">
            {sorted.length === 1
              ? "Here is your winner"
              : `Here are your ${sorted.length} winners`}
          </h2>
        </div>

        {/* ---- Podium ---- */}
        <div
          className={`rf-podium ${has3 ? "rf-podium-3" : has2 ? "rf-podium-2" : "rf-podium-1"}`}
        >
          {/* 3rd place (left) */}
          {has3 && top3 && (
            <PodiumCard
              winner={top3}
              rank={3}
              heightClass="rf-podium-height-3"
            />
          )}

          {/* 1st place (center, tallest) */}
          {top1 && (
            <PodiumCard
              winner={top1}
              rank={1}
              heightClass="rf-podium-height-1"
            />
          )}

          {/* 2nd place (right) */}
          {has2 && top2 && (
            <PodiumCard
              winner={top2}
              rank={2}
              heightClass="rf-podium-height-2"
            />
          )}
        </div>

        {/* ---- Everyone else (4th+) ---- */}
        {rest.length > 0 && (
          <div className="rf-finale-rest">
            <h3 className="rf-finale-rest-title">
              Also winners ({rest.length})
            </h3>
            <div className="rf-finale-grid">
              {rest.map((w) => (
                <div key={w.id} className="rf-finale-item">
                  <div className="rf-finale-item-position">
                    {ordinal(w.position)}
                  </div>
                  <div className="rf-finale-item-name">
                    {w.customerName ?? "Anonymous"}
                  </div>
                  <div className="rf-finale-item-email">
                    {w.customerEmail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Close ---- */}
        <div className="rf-finale-actions">
          <button className="rf-btn rf-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// Podium card
// ======================================================

function PodiumCard({
  winner,
  rank,
  heightClass,
}: {
  winner: Winner;
  rank: 1 | 2 | 3;
  heightClass: string;
}) {
  return (
    <div className={`rf-podium-column ${heightClass}`}>
      <div className={`rf-podium-winner rf-podium-winner-${rank}`}>
        {rank === 1 && (
          <div className="rf-podium-crown">
            <CrownIcon />
          </div>
        )}
        <div className="rf-podium-rank">{ordinal(rank)}</div>
        <div className="rf-podium-name">
          {winner.customerName ?? "Anonymous"}
        </div>
        <div className="rf-podium-email">{winner.customerEmail}</div>
      </div>
      <div className={`rf-podium-base rf-podium-base-${rank}`}>
        <span className="rf-podium-base-number">{rank}</span>
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

function DiceIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M3 7l4 5 5-7 5 7 4-5v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="6 3 20 12 6 21" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}