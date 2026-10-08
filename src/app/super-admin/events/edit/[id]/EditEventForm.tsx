"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Category = {
  id: number;
  name: string;
  ticketTypes: { id: number; name: string }[];
};

type FormState = {
  title: string;
  description: string;
  eventTime: string;
  location: string;
  visibility: "ongoing" | "past" | "draft";
  coverImage: string;
  galleryImages: string[];
  sequenceCode: string;

  // ⭐ Past event showcase
  pastEventTitle: string;
  pastEventStory: string;

  // ⭐ NEW — ticket design
  ticketImageUrl: string;
  ticketImageTextColor: "light" | "dark";
};

type ExternalLinkType =
  | "youtube"
  | "facebook"
  | "instagram"
  | "photo_album"
  | "website"
  | "other";

type ExternalLink = {
  /** client-side key for React reconciliation */
  key: string;
  /** undefined = new link, will get an id on save */
  id?: number;
  type: ExternalLinkType;
  label: string;
  url: string;
  sortOrder: number;
};

type SelectedTicket = {
  categoryId: number;
  typeId: number;
  price: string;
  limit: string;
};

interface EditEventFormProps {
  form: FormState;
  setForm: (v: FormState) => void;
  categories: Category[];
  selectedCategories: number[];
  setSelectedCategories: (v: number[]) => void;
  selectedTypes: number[];
  setSelectedTypes: (v: number[]) => void;
  eventTickets: SelectedTicket[];
  setEventTickets: (v: SelectedTicket[]) => void;
  save: (links: ExternalLink[]) => void;
  saving: boolean;
  hasSoldTickets: boolean;
  soldTicketCount: number;
  externalLinks: ExternalLink[];
  setExternalLinks: (v: ExternalLink[]) => void;
}

const MAX_GALLERY = 6;
const SEQUENCE_CODE_REGEX = /^[a-z][a-z0-9]{3,31}$/;

const LINK_TYPE_OPTIONS: { value: ExternalLinkType; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "photo_album", label: "Photo album" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

function generateKey() {
  return Math.random().toString(36).slice(2, 10);
}

export default function EditEventForm({
  form,
  setForm,
  categories,
  selectedCategories,
  setSelectedCategories,
  selectedTypes,
  setSelectedTypes,
  eventTickets,
  setEventTickets,
  save,
  saving,
  hasSoldTickets,
  soldTicketCount,
  externalLinks,
  setExternalLinks,
}: EditEventFormProps) {
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ---- Upload helper ----
  async function uploadToCloudinary(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/super-admin/events/upload", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      body: formData,
    });

    const data = await res.json();
    return data.url;
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setForm({ ...form, coverImage: url });
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeCoverImage() {
    setForm({ ...form, coverImage: "" });
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_GALLERY - form.galleryImages.length;
    if (remaining <= 0) {
      alert(`Maximum ${MAX_GALLERY} gallery images allowed`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of toUpload) {
        uploadedUrls.push(await uploadToCloudinary(file));
      }
      setForm({
        ...form,
        galleryImages: [...form.galleryImages, ...uploadedUrls],
      });
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeGalleryImage(index: number) {
    const updated = [...form.galleryImages];
    updated.splice(index, 1);
    setForm({ ...form, galleryImages: updated });
  }

  // ⭐ NEW — Ticket design upload
  async function handleTicketImageUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setForm({ ...form, ticketImageUrl: url });
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeTicketImage() {
    setForm({
      ...form,
      ticketImageUrl: "",
      ticketImageTextColor: "light",
    });
  }

  // ---- Ticket toggles ----
  function toggleCategory(categoryId: number) {
    if (selectedCategories.includes(categoryId)) {
      setSelectedCategories(
        selectedCategories.filter((id) => id !== categoryId)
      );
      const cat = categories.find((c) => c.id === categoryId);
      const typeIds = cat?.ticketTypes.map((t) => t.id) ?? [];
      setSelectedTypes(selectedTypes.filter((id) => !typeIds.includes(id)));
      setEventTickets(
        eventTickets.filter((t) => !typeIds.includes(t.typeId))
      );
    } else {
      setSelectedCategories([...selectedCategories, categoryId]);
    }
  }

  function toggleType(categoryId: number, typeId: number) {
    if (selectedTypes.includes(typeId)) {
      setSelectedTypes(selectedTypes.filter((id) => id !== typeId));
      setEventTickets(eventTickets.filter((t) => t.typeId !== typeId));
    } else {
      setSelectedTypes([...selectedTypes, typeId]);
      setEventTickets([
        ...eventTickets,
        { categoryId, typeId, price: "", limit: "" },
      ]);
    }
  }

  function updateTicket(
    typeId: number,
    field: "price" | "limit",
    value: string
  ) {
    setEventTickets(
      eventTickets.map((t) =>
        t.typeId === typeId ? { ...t, [field]: value } : t
      )
    );
  }

  // ---- External link handlers ----
  function addLink() {
    setExternalLinks([
      ...externalLinks,
      {
        key: generateKey(),
        type: "youtube",
        label: "",
        url: "",
        sortOrder: externalLinks.length,
      },
    ]);
  }

  function updateLink<K extends keyof ExternalLink>(
    key: string,
    field: K,
    value: ExternalLink[K]
  ) {
    setExternalLinks(
      externalLinks.map((l) =>
        l.key === key ? { ...l, [field]: value } : l
      )
    );
    if (errors.links) setErrors({ ...errors, links: "" });
  }

  function removeLink(key: string) {
    setExternalLinks(externalLinks.filter((l) => l.key !== key));
  }

  function moveLink(key: string, direction: -1 | 1) {
    const idx = externalLinks.findIndex((l) => l.key === key);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= externalLinks.length) return;

    const updated = [...externalLinks];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    updated.forEach((l, i) => (l.sortOrder = i));
    setExternalLinks(updated);
  }

  // ---- Live price range for preview ----
  const priceRange = useMemo(() => {
    const prices = eventTickets
      .map((t) => Number(t.price))
      .filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length === 0) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [eventTickets]);

  const isPast = form.visibility === "past";

  // ---- Validation ----
  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!form.title.trim()) next.title = "Title is required";
    if (!form.description.trim()) next.description = "Description is required";
    if (!form.eventTime.trim()) next.eventTime = "Event time is required";
    if (!form.location.trim()) next.location = "Location is required";

    if (!hasSoldTickets) {
      const code = form.sequenceCode.trim().toLowerCase();
      if (!code) {
        next.sequenceCode = "Sequence code is required";
      } else if (!SEQUENCE_CODE_REGEX.test(code)) {
        next.sequenceCode =
          "Must be 4–32 chars, start with a letter, lowercase letters + digits only.";
      }
    }

    if (eventTickets.length === 0) {
      next.tickets = "Select at least one ticket type";
    } else {
      for (const t of eventTickets) {
        const price = Number(t.price);
        const limit = Number(t.limit);
        if (!t.price || !Number.isFinite(price) || price <= 0) {
          next.tickets = "Every selected ticket needs a valid price";
          break;
        }
        if (!t.limit || !Number.isFinite(limit) || limit <= 0) {
          next.tickets = "Every selected ticket needs a valid limit";
          break;
        }
      }
    }

    const linksWithAnyContent = externalLinks.filter(
      (l) => l.label.trim() || l.url.trim()
    );

    for (const l of linksWithAnyContent) {
      if (!l.label.trim()) {
        next.links = "Every link needs a label";
        break;
      }
      if (!l.url.trim()) {
        next.links = "Every link needs a URL";
        break;
      }
      if (!/^https?:\/\//i.test(l.url.trim())) {
        next.links = `URL must start with http:// or https:// — got "${l.url}"`;
        break;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const cleaned = externalLinks
      .filter((l) => l.label.trim() && l.url.trim())
      .map((l, i) => ({ ...l, sortOrder: i }));
    save(cleaned);
  }

  return (
    <div className="edit-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/events" className="edit-back">
        <ArrowLeftIcon />
        Back to Events
      </Link>

      {/* ---- Header ---- */}
      <header className="edit-header">
        <div>
          <h1 className="edit-title">Edit Event</h1>
          <p className="edit-subtitle">
            Update details, adjust tickets, or replace images
          </p>
        </div>
      </header>

      <div className="edit-layout">
        <div className="edit-main">
          {/* ---- STEP 1: Details ---- */}
          <section className="edit-card">
            <div className="edit-card-header">
              <span className="edit-step">1</span>
              <div>
                <h2 className="edit-card-title">Event Details</h2>
                <p className="edit-card-subtitle">
                  Basic information customers will see
                </p>
              </div>
            </div>

            <div className="edit-field">
              <label className="edit-label" htmlFor="ee-title">
                Title <span className="edit-required">*</span>
              </label>
              <input
                id="ee-title"
                className={`edit-input ${errors.title ? "error" : ""}`}
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value });
                  if (errors.title)
                    setErrors((prev) => ({ ...prev, title: "" }));
                }}
              />
              {errors.title && (
                <span className="edit-error">{errors.title}</span>
              )}
            </div>

            <div className="edit-field">
              <label className="edit-label" htmlFor="ee-desc">
                Description <span className="edit-required">*</span>
              </label>
              <textarea
                id="ee-desc"
                className={`edit-input edit-textarea ${
                  errors.description ? "error" : ""
                }`}
                value={form.description}
                onChange={(e) => {
                  setForm({ ...form, description: e.target.value });
                  if (errors.description)
                    setErrors((prev) => ({ ...prev, description: "" }));
                }}
                rows={4}
              />
              {errors.description && (
                <span className="edit-error">{errors.description}</span>
              )}
            </div>

            <div className="edit-grid-2">
              <div className="edit-field">
                <label className="edit-label" htmlFor="ee-time">
                  Event Time <span className="edit-required">*</span>
                </label>
                <input
                  id="ee-time"
                  className={`edit-input ${errors.eventTime ? "error" : ""}`}
                  value={form.eventTime}
                  onChange={(e) => {
                    setForm({ ...form, eventTime: e.target.value });
                    if (errors.eventTime)
                      setErrors((prev) => ({ ...prev, eventTime: "" }));
                  }}
                  placeholder="e.g. 19:30"
                />
                {errors.eventTime && (
                  <span className="edit-error">{errors.eventTime}</span>
                )}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor="ee-loc">
                  Location <span className="edit-required">*</span>
                </label>
                <input
                  id="ee-loc"
                  className={`edit-input ${errors.location ? "error" : ""}`}
                  value={form.location}
                  onChange={(e) => {
                    setForm({ ...form, location: e.target.value });
                    if (errors.location)
                      setErrors((prev) => ({ ...prev, location: "" }));
                  }}
                  placeholder="e.g. Messukeskus, Helsinki"
                />
                {errors.location && (
                  <span className="edit-error">{errors.location}</span>
                )}
              </div>
            </div>

            {/* ---- Sequence Code ---- */}
            <div className="edit-field">
              <label className="edit-label" htmlFor="ee-seq">
                Sequence Code
                {!hasSoldTickets && (
                  <span className="edit-required"> *</span>
                )}
                {hasSoldTickets && (
                  <span className="edit-lock" title="Locked">
                    <LockIcon />
                  </span>
                )}
              </label>

              <input
                id="ee-seq"
                className={`edit-input edit-input-mono ${
                  errors.sequenceCode ? "error" : ""
                } ${hasSoldTickets ? "edit-input-readonly" : ""}`}
                value={form.sequenceCode}
                onChange={(e) => {
                  if (hasSoldTickets) return;
                  const v = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "");
                  setForm({ ...form, sequenceCode: v });
                  if (errors.sequenceCode)
                    setErrors((prev) => ({ ...prev, sequenceCode: "" }));
                }}
                readOnly={hasSoldTickets}
                disabled={hasSoldTickets}
                placeholder="e.g. taprosa2026"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
              />

              {hasSoldTickets ? (
                <span className="edit-lock-notice">
                  <LockIcon />
                  Locked — {soldTicketCount}{" "}
                  {soldTicketCount === 1 ? "ticket has" : "tickets have"}{" "}
                  already been sold for this event.
                </span>
              ) : (
                <span className="edit-hint">
                  Prefix used for every ticket number sold for this event.
                </span>
              )}

              {errors.sequenceCode && (
                <span className="edit-error">{errors.sequenceCode}</span>
              )}
            </div>

            <div className="edit-field">
              <label className="edit-label">Visibility</label>
              <div className="edit-visibility-options">
                {(
                  [
                    {
                      key: "ongoing" as const,
                      label: "Ongoing",
                      desc: "Live and selling tickets",
                    },
                    {
                      key: "draft" as const,
                      label: "Draft",
                      desc: "Not visible to customers yet",
                    },
                    {
                      key: "past" as const,
                      label: "Past",
                      desc: "Archived — show the story modal",
                    },
                  ] as const
                ).map((opt) => {
                  const selected = form.visibility === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`edit-visibility-card ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() =>
                        setForm({ ...form, visibility: opt.key })
                      }
                    >
                      <div className="edit-visibility-radio">
                        {selected && (
                          <span className="edit-visibility-radio-dot" />
                        )}
                      </div>
                      <div>
                        <div className="edit-visibility-label">
                          {opt.label}
                        </div>
                        <div className="edit-visibility-desc">
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- STEP 1.5: Past Event Showcase (only when past) ---- */}
          {isPast && (
            <section className="edit-card edit-card-showcase">
              <div className="edit-card-header">
                <span className="edit-step edit-step-accent">
                  <StarIcon />
                </span>
                <div>
                  <h2 className="edit-card-title">Past Event Showcase</h2>
                  <p className="edit-card-subtitle">
                    Write a story about this event and link external media
                  </p>
                </div>
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor="ee-past-title">
                  Story headline
                </label>
                <input
                  id="ee-past-title"
                  type="text"
                  className="edit-input"
                  value={form.pastEventTitle}
                  onChange={(e) =>
                    setForm({ ...form, pastEventTitle: e.target.value })
                  }
                  placeholder="e.g. A night to remember — Taprobane Live 2026"
                  maxLength={255}
                />
                <span className="edit-hint">
                  Shown as the big heading on the story modal. Falls back to
                  the event title if left empty.
                </span>
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor="ee-past-story">
                  Story
                </label>
                <textarea
                  id="ee-past-story"
                  className="edit-input edit-textarea"
                  value={form.pastEventStory}
                  onChange={(e) =>
                    setForm({ ...form, pastEventStory: e.target.value })
                  }
                  rows={8}
                  placeholder="Tell the story of this event…&#10;&#10;Leave a blank line between paragraphs."
                />
                <span className="edit-hint">
                  Plain text. Blank lines become paragraph breaks.
                </span>
              </div>

              {/* ---- External links ---- */}
              <div className="edit-field">
                <label className="edit-label">
                  External links ({externalLinks.length})
                </label>
                <span className="edit-hint" style={{ marginBottom: 12 }}>
                  Link to YouTube videos, Facebook albums, Instagram posts,
                  or anywhere else. Each link shows as a clickable card on the
                  customer's story modal.
                </span>

                {errors.links && (
                  <div className="edit-error-banner">{errors.links}</div>
                )}

                <div className="edit-links-list">
                  {externalLinks.length === 0 && (
                    <p className="edit-links-empty">
                      No links added yet.
                    </p>
                  )}

                  {externalLinks.map((link, index) => (
                    <div key={link.key} className="edit-link-row">
                      <div className="edit-link-row-header">
                        <span className="edit-link-index">
                          {index + 1}
                        </span>
                        <select
                          className="edit-input edit-link-type-select"
                          value={link.type}
                          onChange={(e) =>
                            updateLink(
                              link.key,
                              "type",
                              e.target.value as ExternalLinkType
                            )
                          }
                        >
                          {LINK_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <div className="edit-link-move">
                          <button
                            type="button"
                            className="edit-link-move-btn"
                            onClick={() => moveLink(link.key, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="edit-link-move-btn"
                            onClick={() => moveLink(link.key, 1)}
                            disabled={index === externalLinks.length - 1}
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          type="button"
                          className="edit-link-remove"
                          onClick={() => removeLink(link.key)}
                          aria-label="Remove link"
                        >
                          <TrashIcon />
                        </button>
                      </div>

                      <div className="edit-link-fields">
                        <input
                          type="text"
                          className="edit-input"
                          value={link.label}
                          onChange={(e) =>
                            updateLink(link.key, "label", e.target.value)
                          }
                          placeholder="Label (e.g. Watch the aftermovie)"
                          maxLength={255}
                        />
                        <input
                          type="url"
                          className="edit-input edit-input-mono"
                          value={link.url}
                          onChange={(e) =>
                            updateLink(link.key, "url", e.target.value)
                          }
                          placeholder="https://youtube.com/watch?v=..."
                          maxLength={1000}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="edit-add-type-btn"
                  onClick={addLink}
                >
                  <PlusIcon />
                  Add link
                </button>
              </div>
            </section>
          )}

          {/* ---- STEP 2: Tickets ---- */}
          <section className="edit-card">
            <div className="edit-card-header">
              <span className="edit-step">2</span>
              <div>
                <h2 className="edit-card-title">Tickets</h2>
                <p className="edit-card-subtitle">
                  Add or remove ticket types, adjust prices and limits
                </p>
              </div>
            </div>

            {errors.tickets && (
              <div className="edit-banner edit-banner-error">
                {errors.tickets}
              </div>
            )}

            <div className="edit-categories">
              {categories.map((cat) => {
                const catSelected = selectedCategories.includes(cat.id);
                return (
                  <div
                    key={cat.id}
                    className={`edit-category ${
                      catSelected ? "open" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="edit-category-header"
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <span
                        className={`edit-checkbox ${
                          catSelected ? "checked" : ""
                        }`}
                      >
                        {catSelected && <CheckIcon />}
                      </span>
                      <span className="edit-category-name">{cat.name}</span>
                      <span className="edit-category-count">
                        {cat.ticketTypes.length}{" "}
                        {cat.ticketTypes.length === 1 ? "type" : "types"}
                      </span>
                    </button>

                    {catSelected && (
                      <div className="edit-types">
                        {cat.ticketTypes.length === 0 ? (
                          <p className="edit-muted edit-muted-sm">
                            No types in this category.
                          </p>
                        ) : (
                          cat.ticketTypes.map((type) => {
                            const typeSelected = selectedTypes.includes(
                              type.id
                            );
                            const ticket = eventTickets.find(
                              (t) => t.typeId === type.id
                            );

                            return (
                              <div
                                key={type.id}
                                className={`edit-type ${
                                  typeSelected ? "selected" : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  className="edit-type-header"
                                  onClick={() =>
                                    toggleType(cat.id, type.id)
                                  }
                                >
                                  <span
                                    className={`edit-checkbox edit-checkbox-sm ${
                                      typeSelected ? "checked" : ""
                                    }`}
                                  >
                                    {typeSelected && <CheckIcon />}
                                  </span>
                                  <span className="edit-type-name">
                                    {type.name}
                                  </span>
                                </button>

                                {typeSelected && ticket && (
                                  <div className="edit-type-inputs">
                                    <div className="edit-type-input">
                                      <label
                                        className="edit-label-sm"
                                        htmlFor={`edit-price-${type.id}`}
                                      >
                                        Price (€)
                                      </label>
                                      <input
                                        id={`edit-price-${type.id}`}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="edit-input"
                                        placeholder="50.00"
                                        value={
                                          ticket.price
                                            ? String(
                                                Number(ticket.price) / 100
                                              )
                                            : ""
                                        }
                                        onChange={(e) => {
                                          const euros = e.target.value;
                                          const cents = euros
                                            ? String(
                                                Math.round(
                                                  Number(euros) * 100
                                                )
                                              )
                                            : "";
                                          updateTicket(
                                            type.id,
                                            "price",
                                            cents
                                          );
                                        }}
                                      />
                                    </div>

                                    <div className="edit-type-input">
                                      <label
                                        className="edit-label-sm"
                                        htmlFor={`edit-limit-${type.id}`}
                                      >
                                        Limit
                                      </label>
                                      <input
                                        id={`edit-limit-${type.id}`}
                                        type="number"
                                        min="1"
                                        step="1"
                                        className="edit-input"
                                        placeholder="100"
                                        value={ticket.limit}
                                        onChange={(e) =>
                                          updateTicket(
                                            type.id,
                                            "limit",
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---- STEP 3: Images ---- */}
          <section className="edit-card">
            <div className="edit-card-header">
              <span className="edit-step">3</span>
              <div>
                <h2 className="edit-card-title">Images</h2>
                <p className="edit-card-subtitle">
                  Cover image + up to {MAX_GALLERY} gallery images
                </p>
              </div>
            </div>

            {uploading && (
              <div className="edit-banner edit-banner-info">
                Uploading images…
              </div>
            )}

            <div className="edit-field">
              <label className="edit-label">Cover Image</label>
              <label className="edit-dropzone">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  hidden
                />
                {form.coverImage ? (
                  <div className="edit-dropzone-preview">
                    <img src={form.coverImage} alt="Cover preview" />
                    <span className="edit-dropzone-change">
                      Click to replace
                    </span>
                  </div>
                ) : (
                  <div className="edit-dropzone-empty">
                    <UploadIcon />
                    <span className="edit-dropzone-title">
                      Click to upload
                    </span>
                    <span className="edit-dropzone-hint">
                      Recommended 16:9
                    </span>
                  </div>
                )}
              </label>
              {form.coverImage && (
                <button
                  type="button"
                  className="edit-dropzone-remove"
                  onClick={removeCoverImage}
                >
                  <TrashIcon />
                  Remove cover image
                </button>
              )}
            </div>

            <div className="edit-field">
              <label className="edit-label">
                Gallery Images ({form.galleryImages.length}/{MAX_GALLERY})
              </label>
              {form.galleryImages.length < MAX_GALLERY && (
                <label className="edit-dropzone edit-dropzone-gallery">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryUpload}
                    hidden
                  />
                  <div className="edit-dropzone-empty">
                    <UploadIcon />
                    <span className="edit-dropzone-title">
                      Click to add images
                    </span>
                    <span className="edit-dropzone-hint">
                      You can select multiple files
                    </span>
                  </div>
                </label>
              )}

              {form.galleryImages.length > 0 && (
                <div className="edit-gallery-preview">
                  {form.galleryImages.map((img, i) => (
                    <div key={i} className="edit-gallery-preview-item">
                      <img src={img} alt={`Gallery ${i + 1}`} />
                      <button
                        type="button"
                        className="edit-gallery-remove"
                        onClick={() => removeGalleryImage(i)}
                        aria-label="Remove image"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ---- ⭐ STEP 4: Ticket Design ---- */}
          <section className="edit-card edit-card-ticket-design">
            <div className="edit-card-header">
              <span className="edit-step edit-step-ticket">
                <TicketIcon />
              </span>
              <div>
                <h2 className="edit-card-title">Ticket Design</h2>
                <p className="edit-card-subtitle">
                  Upload a portrait background image for the printed ticket
                  PDF. Leave empty to use the default white ticket.
                </p>
              </div>
            </div>

            <div className="edit-field">
              <label className="edit-label">
                Ticket background image
                <span className="edit-label-note"> — portrait, A5 ratio</span>
              </label>

              {form.ticketImageUrl ? (
                <div className="edit-ticket-image-set">
                  <div className="edit-ticket-image-thumb">
                    <img
                      src={form.ticketImageUrl}
                      alt="Ticket background"
                    />
                  </div>
                  <div className="edit-ticket-image-actions">
                    <label className="edit-ticket-change-btn">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleTicketImageUpload}
                        hidden
                      />
                      <UploadIcon />
                      Replace image
                    </label>
                    <button
                      type="button"
                      className="edit-dropzone-remove"
                      onClick={removeTicketImage}
                    >
                      <TrashIcon />
                      Remove image
                    </button>
                  </div>
                </div>
              ) : (
                <label className="edit-dropzone edit-dropzone-ticket">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleTicketImageUpload}
                    hidden
                  />
                  <div className="edit-dropzone-empty">
                    <TicketIcon />
                    <span className="edit-dropzone-title">
                      Click to upload ticket background
                    </span>
                    <span className="edit-dropzone-hint">
                      Portrait image — recommended 2:3 or A5 (e.g. 1000 × 1414)
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Text color toggle — only meaningful when image is set */}
            {form.ticketImageUrl && (
              <div className="edit-field">
                <label className="edit-label">
                  Text color on the ticket
                  <span className="edit-label-note">
                    {" "}
                    — pick the one that reads best on your image
                  </span>
                </label>

                <div className="edit-color-options">
                  <button
                    type="button"
                    className={`edit-color-card ${
                      form.ticketImageTextColor === "light" ? "selected" : ""
                    }`}
                    onClick={() =>
                      setForm({ ...form, ticketImageTextColor: "light" })
                    }
                  >
                    <div className="edit-color-swatch edit-color-swatch-dark">
                      <span>Aa</span>
                    </div>
                    <div>
                      <div className="edit-color-label">Light text</div>
                      <div className="edit-color-desc">
                        White text + dark scrim — best on dark images
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`edit-color-card ${
                      form.ticketImageTextColor === "dark" ? "selected" : ""
                    }`}
                    onClick={() =>
                      setForm({ ...form, ticketImageTextColor: "dark" })
                    }
                  >
                    <div className="edit-color-swatch edit-color-swatch-light">
                      <span>Aa</span>
                    </div>
                    <div>
                      <div className="edit-color-label">Dark text</div>
                      <div className="edit-color-desc">
                        Dark text + light scrim — best on bright images
                      </div>
                    </div>
                  </button>
                </div>

                <span className="edit-hint">
                  We layer a subtle scrim over the image to keep the text
                  readable regardless.
                </span>
              </div>
            )}

            {/* Live ticket preview */}
            <div className="edit-field">
              <label className="edit-label">Preview</label>
              <TicketDesignPreview
                imageUrl={form.ticketImageUrl}
                textColor={form.ticketImageTextColor}
                eventTitle={form.title}
                eventTime={form.eventTime}
                eventLocation={form.location}
                categories={categories}
                eventTickets={eventTickets}
              />
              <span className="edit-hint">
                Approximate preview. The actual PDF keeps the QR code in the
                same position.
              </span>
            </div>
          </section>
        </div>

        {/* ============================================ */}
        {/* Preview column                                */}
        {/* ============================================ */}
        <aside className="edit-aside">
          <div className="edit-preview">
            <div className="edit-preview-label">Live preview</div>

            <div className="edit-preview-card">
              <div className="edit-preview-image">
                {form.coverImage ? (
                  <img src={form.coverImage} alt="Cover" />
                ) : (
                  <div className="edit-preview-image-placeholder">
                    <ImageIcon />
                  </div>
                )}
              </div>

              <div className="edit-preview-body">
                <h3 className="edit-preview-title">
                  {form.title || "Event title"}
                </h3>

                {(form.eventTime || form.location) && (
                  <div className="edit-preview-meta">
                    {form.eventTime && (
                      <span className="edit-preview-meta-item">
                        <ClockIcon />
                        {form.eventTime}
                      </span>
                    )}
                    {form.location && (
                      <span className="edit-preview-meta-item">
                        <PinIcon />
                        {form.location}
                      </span>
                    )}
                  </div>
                )}

                {priceRange && (
                  <div className="edit-preview-price">
                    {priceRange.min === priceRange.max
                      ? `€${(priceRange.min / 100).toFixed(2)}`
                      : `€${(priceRange.min / 100).toFixed(0)} – €${(
                          priceRange.max / 100
                        ).toFixed(0)}`}
                  </div>
                )}

                {form.sequenceCode && (
                  <div className="edit-preview-seq">
                    <span className="edit-preview-seq-label">
                      Ticket prefix
                    </span>
                    <span className="edit-preview-seq-value">
                      {form.sequenceCode}
                    </span>
                  </div>
                )}

                {isPast && externalLinks.length > 0 && (
                  <div className="edit-preview-links">
                    <span className="edit-preview-seq-label">
                      Story links
                    </span>
                    <span className="edit-preview-seq-value">
                      {externalLinks.length}{" "}
                      {externalLinks.length === 1 ? "link" : "links"}
                    </span>
                  </div>
                )}

                <div className="edit-preview-visibility">
                  <span className="edit-preview-meta-count">
                    {eventTickets.length}{" "}
                    {eventTickets.length === 1
                      ? "ticket type"
                      : "ticket types"}
                  </span>
                  <span
                    className={`edit-preview-pill edit-preview-pill-${form.visibility}`}
                  >
                    {form.visibility.charAt(0).toUpperCase() +
                      form.visibility.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            <p className="edit-preview-note">
              This is how customers will see your event on the homepage.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Sticky action bar ---- */}
      <div className="edit-actions">
        <div className="edit-actions-inner">
          <Link
            href="/super-admin/events"
            className="edit-btn edit-btn-ghost"
          >
            Cancel
          </Link>
          <button
            type="button"
            className="edit-btn edit-btn-primary"
            onClick={handleSave}
            disabled={saving || uploading}
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
// ⭐ Ticket design preview (portrait)
// ======================================================

function TicketDesignPreview({
  imageUrl,
  textColor,
  eventTitle,
  eventTime,
  eventLocation,
  categories,
  eventTickets,
}: {
  imageUrl: string;
  textColor: "light" | "dark";
  eventTitle: string;
  eventTime: string;
  eventLocation: string;
  categories: Category[];
  eventTickets: SelectedTicket[];
}) {
  const first = eventTickets[0];
  const cat = categories.find((c) => c.id === first?.categoryId);
  const type = cat?.ticketTypes.find((t) => t.id === first?.typeId);

  const isLight = textColor === "light";
  const scrim = isLight
    ? "linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))"
    : "linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.4))";

  return (
    <div className="tdp-wrap">
      <div className="tdp-page">
        {imageUrl ? (
          <div
            className="tdp-bg"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        ) : (
          <div className="tdp-bg tdp-bg-empty" />
        )}

        {imageUrl && (
          <div className="tdp-scrim" style={{ background: scrim }} />
        )}

        <div
          className={`tdp-content ${
            isLight ? "tdp-content-light" : "tdp-content-dark"
          } ${imageUrl ? "tdp-content-photo" : "tdp-content-classic"}`}
        >
          {/* Header */}
          <div className="tdp-header">
            <div className="tdp-brand">TaprobaneTicket</div>
            {cat && <div className="tdp-badge">{cat.name.toUpperCase()}</div>}
          </div>
          {type && <div className="tdp-type">{type.name}</div>}

          <div className="tdp-divider" />

          {/* Title */}
          <div className="tdp-title-row">
            <div className="tdp-title-bar" />
            <div className="tdp-title">{eventTitle || "Event title"}</div>
          </div>

          {/* Details grid */}
          <div className="tdp-grid">
            <div className="tdp-cell">
              <div className="tdp-label">EVENT DATE & TIME</div>
              <div className="tdp-value">{eventTime || "-"}</div>
            </div>
            <div className="tdp-cell">
              <div className="tdp-label">VENUE</div>
              <div className="tdp-value">{eventLocation || "-"}</div>
            </div>
            <div className="tdp-cell">
              <div className="tdp-label">TICKET CATEGORY</div>
              <div className="tdp-value">{cat?.name || "-"}</div>
            </div>
            <div className="tdp-cell">
              <div className="tdp-label">TICKET TYPE</div>
              <div className="tdp-value">{type?.name || "-"}</div>
            </div>
            <div className="tdp-cell">
              <div className="tdp-label">TICKET CODE</div>
              <div className="tdp-value">ABC001-0001</div>
            </div>
          </div>

          {/* QR placeholder */}
          <div className="tdp-qr-wrap">
            <div className="tdp-qr-label">SCAN AT ENTRANCE</div>
            <div className="tdp-qr">
              <div className="tdp-qr-inner">
                <QrPlaceholder />
              </div>
            </div>
          </div>
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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ⭐ NEW — ticket icon
function TicketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 3" />
    </svg>
  );
}

// ⭐ QR placeholder for preview
function QrPlaceholder() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      fill="#1a1a1a"
      aria-hidden="true"
    >
      {/* Corners */}
      <rect x="2" y="2" width="24" height="24" />
      <rect x="6" y="6" width="16" height="16" fill="#ffffff" />
      <rect x="10" y="10" width="8" height="8" />

      <rect x="74" y="2" width="24" height="24" />
      <rect x="78" y="6" width="16" height="16" fill="#ffffff" />
      <rect x="82" y="10" width="8" height="8" />

      <rect x="2" y="74" width="24" height="24" />
      <rect x="6" y="78" width="16" height="16" fill="#ffffff" />
      <rect x="10" y="82" width="8" height="8" />

      {/* Random noise blocks */}
      <rect x="32" y="4" width="4" height="4" />
      <rect x="40" y="8" width="4" height="4" />
      <rect x="48" y="4" width="4" height="4" />
      <rect x="56" y="12" width="4" height="4" />
      <rect x="64" y="4" width="4" height="4" />

      <rect x="32" y="16" width="4" height="4" />
      <rect x="44" y="16" width="4" height="4" />
      <rect x="52" y="20" width="4" height="4" />
      <rect x="60" y="16" width="4" height="4" />

      <rect x="4" y="32" width="4" height="4" />
      <rect x="12" y="36" width="4" height="4" />
      <rect x="20" y="32" width="4" height="4" />

      <rect x="32" y="32" width="8" height="8" />
      <rect x="44" y="32" width="4" height="4" />
      <rect x="52" y="36" width="4" height="4" />
      <rect x="60" y="32" width="8" height="8" />
      <rect x="76" y="32" width="4" height="4" />
      <rect x="88" y="36" width="4" height="4" />

      <rect x="32" y="44" width="4" height="4" />
      <rect x="44" y="48" width="8" height="4" />
      <rect x="60" y="44" width="4" height="4" />
      <rect x="72" y="48" width="4" height="4" />
      <rect x="84" y="44" width="4" height="4" />

      <rect x="32" y="56" width="4" height="4" />
      <rect x="40" y="60" width="4" height="4" />
      <rect x="52" y="56" width="8" height="4" />
      <rect x="68" y="60" width="4" height="4" />
      <rect x="80" y="56" width="4" height="4" />

      <rect x="32" y="72" width="4" height="4" />
      <rect x="44" y="72" width="4" height="4" />
      <rect x="52" y="76" width="4" height="4" />
      <rect x="64" y="72" width="4" height="4" />
      <rect x="76" y="76" width="4" height="4" />
      <rect x="88" y="72" width="4" height="4" />

      <rect x="32" y="88" width="8" height="4" />
      <rect x="44" y="84" width="4" height="4" />
      <rect x="56" y="88" width="4" height="4" />
      <rect x="68" y="84" width="4" height="4" />
      <rect x="80" y="88" width="4" height="4" />
    </svg>
  );
}