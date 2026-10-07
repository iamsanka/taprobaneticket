"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./Emails.css";

type PreviewRecipient = {
  email: string;
  name: string | null;
  meta: string | null;
};

type RecipientSource = "customers" | "staff" | "manual";
type RecipientMode = "all-matching" | "specific";

type Campaign = {
  id: number;
  name: string;
  subject: string;
  recipientType: RecipientSource;
  status: "sending" | "sent" | "partial" | "failed";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
  createdByEmail: string | null;
};

type CampaignDetail = Campaign & { body: string };

type CampaignRecipient = {
  id: number;
  email: string;
  name: string | null;
  status: "sent" | "failed";
  errorMessage: string | null;
  sentAt: string;
};

type EventOption = { id: number; title: string };

const SOURCE_LABELS: Record<RecipientSource, string> = {
  customers: "Customers",
  staff: "Staff & Admins",
  manual: "Manual list",
};

const STATUS_LABELS: Record<Campaign["status"], string> = {
  sending: "Sending",
  sent: "Sent",
  partial: "Partial",
  failed: "Failed",
};

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

export default function EmailsPage() {
  const [tab, setTab] = useState<"compose" | "history">("compose");

  return (
    <div className="em-page">
      <header className="em-header">
        <div>
          <h1 className="em-title">Emails</h1>
          <p className="em-subtitle">
            Send bulk messages to customers and staff, and review past
            campaigns
          </p>
        </div>
      </header>

      <div className="em-tabs">
        <button
          className={`em-tab ${tab === "compose" ? "active" : ""}`}
          onClick={() => setTab("compose")}
        >
          <ComposeIcon />
          Compose
        </button>
        <button
          className={`em-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          <HistoryIcon />
          History
        </button>
      </div>

      {tab === "compose" ? (
        <ComposeTab onSent={() => setTab("history")} />
      ) : (
        <HistoryTab />
      )}
    </div>
  );
}

/* ======================================================
   Compose tab
   ====================================================== */

function ComposeTab({ onSent }: { onSent: () => void }) {
  const [campaignName, setCampaignName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<RecipientSource>("customers");
  const [recipientMode, setRecipientMode] =
    useState<RecipientMode>("all-matching");

  // Customers-only event filter
  const [eventId, setEventId] = useState<string>("all");
  const [events, setEvents] = useState<EventOption[]>([]);

  // Preview list state (from the API)
  const [preview, setPreview] = useState<PreviewRecipient[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  // Specific-mode selection
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Manual mode text
  const [manualText, setManualText] = useState("");

  // Send state
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    total: number;
  } | null>(null);

  // Debounce timer for search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // ---- Load events once ----
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

  // ---- Reset specific-mode selection when source/event changes ----
  useEffect(() => {
    setSelectedEmails(new Set());
    setSearch("");
    setDebouncedSearch("");
  }, [source, eventId]);

  // ---- Load preview from the API ----
  useEffect(() => {
    if (source === "manual") return;

    let cancelled = false;
    setRecipientsLoading(true);

    async function load() {
      try {
        const params = new URLSearchParams({ source });
        if (source === "customers" && eventId !== "all") {
          params.set("eventId", eventId);
        }
        if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }
        params.set("previewLimit", "50");

        const res = await fetch(
          `/api/super-admin/emails/recipients?${params.toString()}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelled) return;

        setPreview(data.preview ?? []);
        setTotalCount(data.totalCount ?? 0);
        setFilteredCount(data.filteredCount ?? 0);
        setHasMore(!!data.hasMore);
      } catch (err) {
        console.error("Failed to load recipients:", err);
        if (!cancelled) setError("Failed to load recipients");
      } finally {
        if (!cancelled) setRecipientsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [source, eventId, debouncedSearch]);

  // ---- Manual list parsing ----
  const manualRecipients = useMemo<PreviewRecipient[]>(() => {
    const seen = new Set<string>();
    const out: PreviewRecipient[] = [];
    const parts = manualText.split(/[\n,;]+/);
    for (const p of parts) {
      const email = p.trim().toLowerCase();
      if (!email) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ email, name: null, meta: null });
    }
    return out;
  }, [manualText]);

  // ---- Effective recipient count for the current send ----
  const recipientCount = useMemo(() => {
    if (source === "manual") return manualRecipients.length;

    if (recipientMode === "all-matching") {
      // When searching in all-matching mode, we should honor the filter
      return debouncedSearch.trim() ? filteredCount : totalCount;
    }

    // Specific mode — how many the user has checked
    return selectedEmails.size;
  }, [
    source,
    recipientMode,
    manualRecipients.length,
    totalCount,
    filteredCount,
    debouncedSearch,
    selectedEmails.size,
  ]);

  // ---- Toggle helper for specific mode ----
  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      for (const p of preview) next.add(p.email);
      return next;
    });
  }

  function clearSelection() {
    setSelectedEmails(new Set());
  }

  // ---- Validation ----
  const canReview =
    campaignName.trim().length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    recipientCount > 0;

  // ---- Review ----
  function handleReview() {
    setError(null);
    if (!campaignName.trim()) return setError("Campaign name is required");
    if (!subject.trim()) return setError("Subject is required");
    if (!body.trim()) return setError("Message body is required");
    if (recipientCount === 0) return setError("Select at least one recipient");

    setShowConfirm(true);
  }

  // ---- Send ----
  async function handleSend() {
    setSending(true);
    setError(null);

    try {
      // Build the request based on mode
      const payload: Record<string, unknown> = {
        name: campaignName.trim(),
        subject: subject.trim(),
        body: body.trim(),
        recipientType: source,
        recipientMode,
      };

      if (source === "customers") {
        payload.eventId = eventId === "all" ? null : Number(eventId);
      }

      if (recipientMode === "specific") {
        // Resolve the explicit list based on source
        let explicitList: { email: string; name: string | null }[] = [];

        if (source === "manual") {
          explicitList = manualRecipients.map((r) => ({
            email: r.email,
            name: r.name,
          }));
        } else {
          // Specific mode uses the selected emails AND requires
          // matching preview entries to have names
          explicitList = Array.from(selectedEmails).map((email) => {
            const found = preview.find((p) => p.email === email);
            return {
              email,
              name: found?.name ?? null,
            };
          });
        }

        payload.recipients = explicitList;
      }
      // For all-matching, recipients is omitted — server resolves

      const res = await fetch("/api/super-admin/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send");
        setShowConfirm(false);
        return;
      }

      setResult({
        sent: data.sent,
        failed: data.failed,
        total: data.total,
      });
      setShowConfirm(false);
    } catch (err) {
      console.error(err);
      setError("Network error");
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  }

  // ---- Success state ----
  if (result) {
    return (
      <div className="em-success">
        <div className="em-success-icon">
          <CheckIcon />
        </div>
        <h2 className="em-success-title">Campaign sent</h2>
        <p className="em-success-text">
          {result.sent} of {result.total}{" "}
          {result.total === 1 ? "message" : "messages"} delivered
          {result.failed > 0 && (
            <>
              {" "}
              · <strong>{result.failed} failed</strong>
            </>
          )}
        </p>

        <div className="em-success-actions">
          <button
            className="em-btn em-btn-primary"
            onClick={() => {
              setResult(null);
              setCampaignName("");
              setSubject("");
              setBody("");
              setManualText("");
              setSelectedEmails(new Set());
              setSearch("");
            }}
          >
            Send another
          </button>
          <button className="em-btn em-btn-ghost" onClick={onSent}>
            View history
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="em-compose">
      {/* ============================================ */}
      {/* Step 1: Recipients                            */}
      {/* ============================================ */}
      <section className="em-card">
        <div className="em-card-header">
          <span className="em-step">1</span>
          <div>
            <h2 className="em-card-title">Who are you sending to?</h2>
            <p className="em-card-subtitle">
              Choose a source, then narrow the audience
            </p>
          </div>
        </div>

        {/* ---- Source picker ---- */}
        <div className="em-source-picker">
          <SourceCard
            value="customers"
            current={source}
            onChange={setSource}
            title="Customers"
            desc="Anyone who's placed a paid order"
            icon={<UsersIcon />}
          />
          <SourceCard
            value="staff"
            current={source}
            onChange={setSource}
            title="Staff & Admins"
            desc="Active users in the admin panel"
            icon={<ShieldIcon />}
          />
          <SourceCard
            value="manual"
            current={source}
            onChange={setSource}
            title="Manual list"
            desc="Paste email addresses"
            icon={<TypeIcon />}
          />
        </div>

        {/* ---- Customers: event filter ---- */}
        {source === "customers" && (
          <div className="em-field">
            <label className="em-label">Filter by event</label>
            <select
              className="em-input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="all">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
            <p className="em-muted">
              Only customers who bought tickets for the selected event will
              be included.
            </p>
          </div>
        )}

        {/* ---- Manual mode ---- */}
        {source === "manual" && (
          <div className="em-field">
            <label className="em-label">
              Email addresses
              <span className="em-hint">
                Comma, semicolon, or newline separated. Duplicates are
                removed automatically.
              </span>
            </label>
            <textarea
              className="em-input em-textarea"
              rows={5}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="alice@example.com, bob@example.com&#10;carol@example.com"
            />
            <p className="em-muted">
              {manualRecipients.length} valid{" "}
              {manualRecipients.length === 1 ? "address" : "addresses"}{" "}
              detected
            </p>
          </div>
        )}

        {/* ---- Customer/staff: count card + mode toggle ---- */}
        {source !== "manual" && (
          <div className="em-audience">
            {recipientsLoading ? (
              <div className="em-audience-loading">
                <span className="em-audience-spinner" />
                Loading audience…
              </div>
            ) : (
              <>
                <div className="em-audience-count">
                  <div className="em-audience-count-value">
                    {(
                      debouncedSearch.trim() ? filteredCount : totalCount
                    ).toLocaleString()}
                  </div>
                  <div className="em-audience-count-label">
                    {debouncedSearch.trim() ? (
                      <>
                        matching "{debouncedSearch}"
                        <span className="em-audience-count-total">
                          {" "}
                          · {totalCount.toLocaleString()} total
                        </span>
                      </>
                    ) : (
                      <>
                        {source === "customers"
                          ? eventId === "all"
                            ? "customers across all events"
                            : "customers for this event"
                          : "active staff & admins"}
                      </>
                    )}
                  </div>
                </div>

                <div className="em-mode-toggle">
                  <button
                    type="button"
                    className={`em-mode-btn ${
                      recipientMode === "all-matching" ? "active" : ""
                    }`}
                    onClick={() => setRecipientMode("all-matching")}
                  >
                    <div className="em-mode-title">Send to all</div>
                    <div className="em-mode-desc">
                      Everyone matching the filter
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`em-mode-btn ${
                      recipientMode === "specific" ? "active" : ""
                    }`}
                    onClick={() => setRecipientMode("specific")}
                  >
                    <div className="em-mode-title">Choose specific</div>
                    <div className="em-mode-desc">
                      Pick individual recipients
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- Specific mode: search + preview list ---- */}
        {source !== "manual" && recipientMode === "specific" && (
          <div className="em-specific">
            <div className="em-specific-toolbar">
              <div className="em-search-wrap">
                <svg
                  className="em-search-icon"
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
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
                  type="text"
                  className="em-search-input"
                  placeholder="Search by email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="em-search-clear"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="em-specific-actions">
                <button
                  type="button"
                  className="em-link-btn"
                  onClick={selectAllVisible}
                  disabled={preview.length === 0}
                >
                  Select visible ({preview.length})
                </button>
                <span className="em-sep">·</span>
                <button
                  type="button"
                  className="em-link-btn"
                  onClick={clearSelection}
                  disabled={selectedEmails.size === 0}
                >
                  Clear ({selectedEmails.size})
                </button>
              </div>
            </div>

            {preview.length === 0 && !recipientsLoading ? (
              <div className="em-empty-inline">
                {debouncedSearch.trim()
                  ? "No recipients match your search."
                  : "No recipients found for this filter."}
              </div>
            ) : (
              <>
                <div className="em-recipients">
                  {preview.map((r) => {
                    const checked = selectedEmails.has(r.email);
                    return (
                      <label
                        key={r.email}
                        className={`em-recipient ${
                          checked ? "selected" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmail(r.email)}
                        />
                        <div className="em-recipient-text">
                          <span className="em-recipient-email">
                            {r.email}
                          </span>
                          {r.name && (
                            <span className="em-recipient-name">
                              {r.name}
                            </span>
                          )}
                        </div>
                        {r.meta && (
                          <span className="em-recipient-meta">
                            {r.meta}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="em-more-hint">
                    Showing first {preview.length} of{" "}
                    {(debouncedSearch.trim()
                      ? filteredCount
                      : totalCount
                    ).toLocaleString()}
                    . Refine your search to narrow down, or use{" "}
                    <strong>Send to all</strong> to reach everyone.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* Step 2: Message                              */}
      {/* ============================================ */}
      <section className="em-card">
        <div className="em-card-header">
          <span className="em-step">2</span>
          <div>
            <h2 className="em-card-title">Compose message</h2>
            <p className="em-card-subtitle">
              Personalize with the <code>{"{{name}}"}</code> token
            </p>
          </div>
        </div>

        <div className="em-field">
          <label className="em-label">Campaign name (internal)</label>
          <input
            type="text"
            className="em-input"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Summer sale — October 2026"
            maxLength={255}
          />
          <p className="em-muted">Only visible to you in the history.</p>
        </div>

        <div className="em-field">
          <label className="em-label">Subject</label>
          <input
            type="text"
            className="em-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Hey {{name}}, our summer event is live!"
            maxLength={255}
          />
        </div>

        <div className="em-field">
          <label className="em-label">Message</label>
          <textarea
            className="em-input em-textarea"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              "Hi {{name}},\n\nWe're excited to announce...\n\nRegards,\nThe Taprobane Team"
            }
          />
          <p className="em-muted">
            Plain text or HTML. Newlines become line breaks automatically.
          </p>
        </div>
      </section>

      {error && <div className="em-error">{error}</div>}

      <div className="em-review-bar">
        <div className="em-review-info">
          <span className="em-review-count">
            {recipientCount.toLocaleString()}{" "}
            {recipientCount === 1 ? "recipient" : "recipients"}
          </span>
          <span className="em-review-source">
            from {SOURCE_LABELS[source]}
            {source === "customers" && eventId !== "all" && (
              <>
                {" "}
                ·{" "}
                {events.find((e) => String(e.id) === eventId)?.title ??
                  "event"}
              </>
            )}
          </span>
        </div>
        <button
          className="em-btn em-btn-primary"
          onClick={handleReview}
          disabled={!canReview}
        >
          Review &amp; Send
          <ArrowRightIcon />
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          campaignName={campaignName}
          subject={subject}
          body={body}
          recipientCount={recipientCount}
          recipientMode={recipientMode}
          sampleRecipient={preview[0] ?? null}
          sending={sending}
          onClose={() => !sending && setShowConfirm(false)}
          onConfirm={handleSend}
        />
      )}
    </div>
  );
}

/* ======================================================
   Source card
   ====================================================== */

function SourceCard({
  value,
  current,
  onChange,
  title,
  desc,
  icon,
}: {
  value: RecipientSource;
  current: RecipientSource;
  onChange: (v: RecipientSource) => void;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      className={`em-source-card ${selected ? "selected" : ""}`}
      onClick={() => onChange(value)}
      aria-pressed={selected}
    >
      <div className="em-source-icon">{icon}</div>
      <div className="em-source-text">
        <div className="em-source-title">{title}</div>
        <div className="em-source-desc">{desc}</div>
      </div>
      <div className="em-source-radio">
        {selected && <span className="em-source-radio-dot" />}
      </div>
    </button>
  );
}

/* ======================================================
   Confirm modal
   ====================================================== */

function ConfirmModal({
  campaignName,
  subject,
  body,
  recipientCount,
  recipientMode,
  sampleRecipient,
  sending,
  onClose,
  onConfirm,
}: {
  campaignName: string;
  subject: string;
  body: string;
  recipientCount: number;
  recipientMode: RecipientMode;
  sampleRecipient: PreviewRecipient | null;
  sending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const previewName = sampleRecipient?.name || "there";
  const previewSubject = subject.replace(
    /\{\{\s*name\s*\}\}/gi,
    previewName
  );
  const previewBody = body.replace(
    /\{\{\s*name\s*\}\}/gi,
    previewName
  );

  return (
    <div className="em-modal-overlay" onClick={onClose}>
      <div className="em-modal" onClick={(e) => e.stopPropagation()}>
        <div className="em-modal-header">
          <h2 className="em-modal-title">Confirm send</h2>
          <button
            className="em-modal-close"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="em-modal-body">
          <div className="em-confirm-row">
            <span className="em-confirm-label">Campaign</span>
            <span className="em-confirm-value">{campaignName}</span>
          </div>
          <div className="em-confirm-row">
            <span className="em-confirm-label">Recipients</span>
            <span className="em-confirm-value">
              {recipientCount.toLocaleString()}{" "}
              {recipientCount === 1 ? "person" : "people"}
              {recipientMode === "all-matching" && (
                <span className="em-confirm-mode"> · all matching</span>
              )}
            </span>
          </div>

          <div className="em-preview">
            <span className="em-preview-label">
              Preview (as {sampleRecipient?.name || "recipient"})
            </span>
            <div className="em-preview-subject">{previewSubject}</div>
            <div className="em-preview-body">{previewBody}</div>
          </div>

          <p className="em-confirm-note">
            This will send {recipientCount.toLocaleString()}{" "}
            {recipientCount === 1 ? "email" : "emails"} immediately. You
            can't undo this.
          </p>
        </div>

        <div className="em-modal-actions">
          <button
            className="em-btn em-btn-ghost"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            className="em-btn em-btn-primary"
            onClick={onConfirm}
            disabled={sending}
          >
            {sending
              ? "Sending…"
              : `Send to ${recipientCount.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================
   History tab (unchanged)
   ====================================================== */

function HistoryTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/emails/campaigns", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch (err) {
      console.error(err);
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="em-history">
      {loading && (
        <div className="em-state">
          <div className="em-state-spinner" />
          <p className="em-state-text">Loading campaigns…</p>
        </div>
      )}

      {error && <div className="em-error">{error}</div>}

      {!loading && !error && campaigns.length === 0 && (
        <div className="em-state">
          <div className="em-state-icon">
            <MailIcon />
          </div>
          <p className="em-state-title">No campaigns yet</p>
          <p className="em-state-text">
            Compose your first bulk email to see it here.
          </p>
        </div>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <div className="em-table-wrap">
          <table className="em-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Subject</th>
                <th>Source</th>
                <th>Sent</th>
                <th className="em-td-right">Recipients</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="em-td-strong">{c.name}</td>
                  <td className="em-td-muted">{c.subject}</td>
                  <td>
                    <span className="em-pill">
                      {SOURCE_LABELS[c.recipientType]}
                    </span>
                  </td>
                  <td className="em-td-muted">
                    {c.sentCount}/{c.totalRecipients}
                  </td>
                  <td className="em-td-right">{c.totalRecipients}</td>
                  <td>
                    <span
                      className={`em-pill em-pill-status-${c.status}`}
                    >
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="em-td-muted">
                    {formatDate(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId !== null && (
        <CampaignDetailModal
          campaignId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/* ======================================================
   Campaign detail modal (unchanged)
   ====================================================== */

function CampaignDetailModal({
  campaignId,
  onClose,
}: {
  campaignId: number;
  onClose: () => void;
}) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/super-admin/emails/campaigns/${campaignId}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Failed to load campaign");
        const data = await res.json();
        setCampaign(data.campaign);
        setRecipients(data.recipients ?? []);
      } catch (err) {
        console.error(err);
        setError("Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  return (
    <div className="em-modal-overlay" onClick={onClose}>
      <div
        className="em-modal em-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="em-modal-header">
          <h2 className="em-modal-title">
            {campaign?.name ?? "Loading…"}
          </h2>
          <button
            className="em-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="em-modal-body">
          {loading && (
            <div className="em-state">
              <div className="em-state-spinner" />
            </div>
          )}

          {error && <div className="em-error">{error}</div>}

          {!loading && !error && campaign && (
            <>
              <div className="em-confirm-row">
                <span className="em-confirm-label">Subject</span>
                <span className="em-confirm-value">{campaign.subject}</span>
              </div>
              <div className="em-confirm-row">
                <span className="em-confirm-label">Source</span>
                <span className="em-confirm-value">
                  {SOURCE_LABELS[campaign.recipientType]}
                </span>
              </div>
              <div className="em-confirm-row">
                <span className="em-confirm-label">Sent by</span>
                <span className="em-confirm-value">
                  {campaign.createdByEmail ?? "—"}
                </span>
              </div>
              <div className="em-confirm-row">
                <span className="em-confirm-label">Date</span>
                <span className="em-confirm-value">
                  {formatDate(campaign.createdAt)}
                </span>
              </div>
              <div className="em-confirm-row">
                <span className="em-confirm-label">Result</span>
                <span className="em-confirm-value">
                  {campaign.sentCount} sent · {campaign.failedCount} failed
                </span>
              </div>

              <div className="em-detail-section">
                <h3 className="em-detail-title">
                  Recipients ({recipients.length})
                </h3>
                <div className="em-table-wrap">
                  <table className="em-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Sent at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id}>
                          <td className="em-td-mono">{r.email}</td>
                          <td className="em-td-muted">
                            {r.name ?? "—"}
                          </td>
                          <td>
                            <span
                              className={`em-pill em-pill-status-${r.status}`}
                            >
                              {r.status === "sent" ? "Sent" : "Failed"}
                            </span>
                            {r.errorMessage && (
                              <div className="em-error-inline">
                                {r.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="em-td-muted">
                            {formatDate(r.sentAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ======================================================
   Icons (unchanged)
   ====================================================== */

function ComposeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
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

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}