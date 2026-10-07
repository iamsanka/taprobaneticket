"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./Scanner.css";

type ScanStatus = "valid" | "already_scanned" | "invalid";

type TicketInfo = {
  ticketNumber: string;
  categoryName: string;
  typeName: string;
  customerName: string;
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  signed?: boolean;
};

type ScanResult =
  | { status: "valid"; ticket: TicketInfo; scannedAt: string | null }
  | { status: "already_scanned"; ticket: TicketInfo; scannedAt: string | null }
  | { status: "invalid"; reason: string; ticketNumber?: string };

const SCANNER_ELEMENT_ID = "qr-reader-region";
const AUTO_DISMISS_MS = 5000; // auto-close modal after 5 seconds

export default function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    { time: string; ticketNumber: string; status: ScanStatus }[]
  >([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  // ---- 1. List cameras on mount ----
  useEffect(() => {
    let cancelled = false;

    async function listCameras() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setCameras(devices);
        const back = devices.find((d) => /back|rear|environment/i.test(d.label));
        setSelectedCameraId(back?.id ?? devices[0]?.id ?? null);
      } catch (err) {
        console.error("Camera enumeration failed:", err);
        if (!cancelled) {
          setError(
            "Camera access was blocked. Allow camera permission and reload the page."
          );
        }
      }
    }

    listCameras();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- 2. Start / stop the scanner ----
  useEffect(() => {
    if (!selectedCameraId) return;
    const cameraId = selectedCameraId;
    let mounted = true;

    async function start() {
            if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(SCANNER_ELEMENT_ID, {
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
      }

      try {
        await scannerRef.current.start(
          cameraId,
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const min = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(min * 0.75);
              return { width: size, height: size };
            },
            aspectRatio: 1,
            disableFlip: false,
          },
          onScanSuccess,
          () => {
            // per-frame decode failures are normal; ignore
          }
        );
        if (mounted) {
          setScanning(true);
          setError(null);
        }
      } catch (err) {
        console.error("Scanner start failed:", err);
        if (mounted) {
          setError(
            "Could not start the camera. Check permissions and try again."
          );
        }
      }
    }

    start();

    return () => {
      mounted = false;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* ignore */
          });
      }
      setScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId]);

  // ---- 3. Scan handler ----
  async function onScanSuccess(decodedText: string) {
    if (lockRef.current) return;
    lockRef.current = true;

    playBeep();
    vibrate();

    await validate(decodedText);

    // Safety net: if validate() fails to close the lock for any reason,
    // release it after the modal's auto-dismiss window + buffer.
    setTimeout(() => {
      lockRef.current = false;
    }, AUTO_DISMISS_MS + 1000);
  }

  async function validate(qrCodeData: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/scanner/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qrCodeData }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          status: "invalid",
          reason: data.error || `Server error (${res.status})`,
        });
        return;
      }

      setResult(data as ScanResult);

      const ticketNumber =
        data.status === "invalid"
          ? data.ticketNumber ?? "(unknown)"
          : data.ticket.ticketNumber;

      setHistory((prev) =>
        [
          {
            time: new Date().toLocaleTimeString(),
            ticketNumber,
            status: data.status,
          },
          ...prev,
        ].slice(0, 10)
      );
    } catch (err) {
      console.error(err);
      setResult({ status: "invalid", reason: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    if (lockRef.current) return;

    lockRef.current = true;
    setManualCode("");

    // Wrap the typed code in the format the API expects.
    // Manual entry is treated as an unsigned raw ticket number.
    const payload = JSON.stringify({
      orderId: 0,
      ticketTypeId: 0,
      ticketNumber: code,
    });

    await validate(payload);

    setTimeout(() => {
      lockRef.current = false;
    }, AUTO_DISMISS_MS + 1000);
  }

  // ---- Dismiss: closes modal AND releases the scan lock ----
  function dismissResult() {
    setResult(null);
    lockRef.current = false;
  }

  return (
    <div className="scanner-page">
      <header className="scanner-header">
        <h1 className="scanner-title">Ticket Scanner</h1>
        <p className="scanner-subtitle">
          Point the camera at a ticket QR to validate entry
        </p>
      </header>

      <div className="scanner-layout">
        <div className="scanner-video-wrap">
          <div id={SCANNER_ELEMENT_ID} className="scanner-video" />

          {cameras.length > 1 && (
            <select
              className="scanner-camera-select"
              value={selectedCameraId ?? ""}
              onChange={(e) => setSelectedCameraId(e.target.value)}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Camera ${c.id.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}

          {!scanning && !error && (
            <div className="scanner-overlay">Starting camera…</div>
          )}

          {error && <div className="scanner-error">{error}</div>}
        </div>

        <div className="scanner-side">
          <section className="scanner-card">
            <h2 className="scanner-card-title">Manual entry</h2>
            <form onSubmit={handleManualSubmit} className="scanner-manual-form">
              <input
                className="scanner-manual-input"
                placeholder="taprosa20260010001"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="scanner-manual-btn"
                disabled={busy || !manualCode.trim()}
              >
                Check
              </button>
            </form>
          </section>

          <section className="scanner-card">
            <h2 className="scanner-card-title">Recent scans</h2>
            {history.length === 0 ? (
              <p className="scanner-muted">No scans yet.</p>
            ) : (
              <ul className="scanner-history">
                {history.map((h, i) => (
                  <li key={i} className={`scanner-history-row ${h.status}`}>
                    <span className="scanner-history-time">{h.time}</span>
                    <span className="scanner-history-ticket">
                      {h.ticketNumber}
                    </span>
                    <span className={`scanner-history-badge ${h.status}`}>
                      {labelForStatus(h.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {result && (
        <ResultModal
          result={result}
          onDismiss={dismissResult}
          autoDismissMs={AUTO_DISMISS_MS}
        />
      )}
    </div>
  );
}

// ======================================================
// Result modal — auto-dismisses after N ms, has manual close button
// ======================================================

function ResultModal({
  result,
  onDismiss,
  autoDismissMs,
}: {
  result: ScanResult;
  onDismiss: () => void;
  autoDismissMs: number;
}) {
  const variant = result.status;
  const title =
    variant === "valid"
      ? "✅ Valid"
      : variant === "already_scanned"
      ? "⛔ Already Used"
      : "⚠️ Invalid";

  const totalSeconds = Math.round(autoDismissMs / 1000);
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  // Keep the latest onDismiss in a ref so the timer effect stays stable
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // Countdown + auto-dismiss
  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, totalSeconds - Math.floor(elapsed / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismissRef.current();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [totalSeconds]);

  return (
    <div className={`result-overlay ${variant}`} onClick={onDismiss}>
      <div className="result-card" onClick={(e) => e.stopPropagation()}>
        <div className="result-icon">{title.split(" ")[0]}</div>
        <h2 className="result-title">{title.split(" ").slice(1).join(" ")}</h2>

        {variant === "invalid" && (
          <p className="result-reason">{result.reason}</p>
        )}

        {variant !== "invalid" && (
          <dl className="result-details">
            <div>
              <dt>Ticket</dt>
              <dd>{result.ticket.ticketNumber}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>
                {result.ticket.categoryName} — {result.ticket.typeName}
              </dd>
            </div>
            <div>
              <dt>Attendee</dt>
              <dd>{result.ticket.customerName}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>{result.ticket.eventTitle}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>{result.ticket.eventTime}</dd>
            </div>
            {variant === "already_scanned" && result.scannedAt && (
              <div>
                <dt>Previously scanned</dt>
                <dd>
                  {new Date(result.scannedAt).toLocaleString("en-GB")}
                </dd>
              </div>
            )}
          </dl>
        )}

        <button
          className="result-dismiss"
          onClick={onDismiss}
          autoFocus
        >
          {variant === "valid" ? "Scan next" : "Close"}
        </button>

        <p className="result-hint">
          Closing automatically in {secondsLeft}s · tap anywhere to close now
        </p>
      </div>
    </div>
  );
}

// ======================================================
// Small utilities
// ======================================================

function labelForStatus(status: ScanStatus): string {
  if (status === "valid") return "Valid";
  if (status === "already_scanned") return "Used";
  return "Invalid";
}

function playBeep() {
  try {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 90);
  } catch {
    // ignore
  }
}

function vibrate() {
  try {
    if (navigator.vibrate) navigator.vibrate(80);
  } catch {
    // ignore
  }
}