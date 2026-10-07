"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./create.css";

type TicketType = {
  id: number;
  name: string;
};

type Category = {
  id: number;
  name: string;
  ticketTypes: TicketType[];
};

type SelectedTicket = {
  categoryId: number;
  typeId: number;
  price: string; // in cents
  limit: string;
};

type FormState = {
  title: string;
  description: string;
  eventTime: string;
  location: string;
  visibility: "ongoing" | "past" | "draft";
  sequenceCode: string;
};

type SequenceCheckState = {
  status: "idle" | "checking" | "available" | "unavailable";
  message: string;
};

const INITIAL_FORM: FormState = {
  title: "",
  description: "",
  eventTime: "",
  location: "",
  visibility: "ongoing",
  sequenceCode: "",
};

const SEQUENCE_CODE_REGEX = /^[a-z][a-z0-9]{3,31}$/;
const MAX_GALLERY = 6;

export default function CreateEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [eventTickets, setEventTickets] = useState<SelectedTicket[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ---- Sequence code live check ----
  const [sequenceCheck, setSequenceCheck] = useState<SequenceCheckState>({
    status: "idle",
    message: "",
  });
  const sequenceCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Load categories ----
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/super-admin/ticket-categories/list");
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (err) {
        console.error("Failed to load categories:", err);
      } finally {
        setCategoriesLoading(false);
      }
    }
    load();
  }, []);

  // ---- Cleanup object URLs on unmount ----
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      galleryPreviews.forEach((u) => URL.revokeObjectURL(u));
      if (sequenceCheckTimer.current) clearTimeout(sequenceCheckTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Debounced sequence code check ----
  useEffect(() => {
    const code = form.sequenceCode.trim().toLowerCase();

    if (sequenceCheckTimer.current) {
      clearTimeout(sequenceCheckTimer.current);
    }

    if (!code) {
      setSequenceCheck({ status: "idle", message: "" });
      return;
    }

    if (!SEQUENCE_CODE_REGEX.test(code)) {
      setSequenceCheck({
        status: "unavailable",
        message:
          "Must be 4–32 chars, start with a letter, lowercase letters + digits only.",
      });
      return;
    }

    setSequenceCheck({ status: "checking", message: "Checking…" });

    sequenceCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/super-admin/event-sequences/check?code=${encodeURIComponent(
            code
          )}`,
          { credentials: "include" }
        );
        const data = await res.json();

        if (data.available) {
          setSequenceCheck({
            status: "available",
            message: "Available",
          });
        } else {
          setSequenceCheck({
            status: "unavailable",
            message: data.reason || "Not available",
          });
        }
      } catch {
        setSequenceCheck({
          status: "unavailable",
          message: "Could not verify — check your connection",
        });
      }
    }, 450);

    return () => {
      if (sequenceCheckTimer.current) clearTimeout(sequenceCheckTimer.current);
    };
  }, [form.sequenceCode]);

  // ---- Image handlers ----
  function handleCoverChange(file: File | null) {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : "");
  }

  function handleGalleryChange(files: FileList | null) {
    const arr = files ? Array.from(files).slice(0, MAX_GALLERY) : [];
    galleryPreviews.forEach((u) => URL.revokeObjectURL(u));
    setGalleryFiles(arr);
    setGalleryPreviews(arr.map((f) => URL.createObjectURL(f)));
  }

  function removeGalleryImage(index: number) {
    URL.revokeObjectURL(galleryPreviews[index]);
    const nextFiles = galleryFiles.filter((_, i) => i !== index);
    const nextPreviews = galleryPreviews.filter((_, i) => i !== index);
    setGalleryFiles(nextFiles);
    setGalleryPreviews(nextPreviews);
  }

  // ---- Ticket toggles ----
  function toggleCategory(categoryId: number) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;

    if (selectedCategories.includes(categoryId)) {
      const typeIds = cat.ticketTypes.map((t) => t.id);
      setSelectedCategories((prev) => prev.filter((id) => id !== categoryId));
      setSelectedTypes((prev) => prev.filter((id) => !typeIds.includes(id)));
      setEventTickets((prev) =>
        prev.filter((t) => !typeIds.includes(t.typeId))
      );
    } else {
      setSelectedCategories((prev) => [...prev, categoryId]);
    }
  }

  function toggleType(categoryId: number, typeId: number) {
    if (selectedTypes.includes(typeId)) {
      setSelectedTypes((prev) => prev.filter((id) => id !== typeId));
      setEventTickets((prev) => prev.filter((t) => t.typeId !== typeId));
    } else {
      setSelectedTypes((prev) => [...prev, typeId]);
      setEventTickets((prev) => [
        ...prev,
        { categoryId, typeId, price: "", limit: "" },
      ]);
    }
  }

  function updateTicket(
    typeId: number,
    field: "price" | "limit",
    value: string
  ) {
    setEventTickets((prev) =>
      prev.map((t) => (t.typeId === typeId ? { ...t, [field]: value } : t))
    );
  }

  // ---- Live price range ----
  const priceRange = useMemo(() => {
    const prices = eventTickets
      .map((t) => Number(t.price))
      .filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max };
  }, [eventTickets]);

  // ---- Validation ----
  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!form.title.trim()) next.title = "Title is required";
    if (!form.description.trim()) next.description = "Description is required";
    if (!form.eventTime.trim()) next.eventTime = "Event time is required";
    if (!form.location.trim()) next.location = "Location is required";

    const code = form.sequenceCode.trim().toLowerCase();
    if (!code) {
      next.sequenceCode = "Sequence code is required";
    } else if (!SEQUENCE_CODE_REGEX.test(code)) {
      next.sequenceCode =
        "Must be 4–32 chars, start with a letter, lowercase letters + digits only.";
    } else if (sequenceCheck.status !== "available") {
      next.sequenceCode = sequenceCheck.message || "Sequence code not available";
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

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ---- Upload helper ----
  async function uploadToCloudinary(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/super-admin/events/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    return data.url;
  }

  async function submit() {
    if (!validate()) return;

    setLoading(true);
    try {
      let coverImageUrl = "";
      const galleryImageUrls: string[] = [];

      if (coverFile) {
        coverImageUrl = await uploadToCloudinary(coverFile);
      }
      for (const file of galleryFiles) {
        galleryImageUrls.push(await uploadToCloudinary(file));
      }

      const res = await fetch("/api/super-admin/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          eventTime: form.eventTime,
          location: form.location,
          visibility: form.visibility,
          coverImage: coverImageUrl,
          galleryImages: galleryImageUrls,
          sequenceCode: form.sequenceCode.trim().toLowerCase(),
          eventTickets: eventTickets.map((t) => ({
            categoryId: t.categoryId,
            typeId: t.typeId,
            price: Number(t.price),
            limit: Number(t.limit),
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/super-admin/events");
      } else {
        alert(data.error || "Something went wrong");
      }
    } catch (err) {
      console.error(err);
      alert("Network error while creating event");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="create-page">
      {/* ---- Back ---- */}
      <Link href="/super-admin/events" className="create-back">
        <ArrowLeftIcon />
        Back to Events
      </Link>

      {/* ---- Header ---- */}
      <header className="create-header">
        <div>
          <h1 className="create-title">Create Event</h1>
          <p className="create-subtitle">
            Set up a new event, choose ticket types, and upload images
          </p>
        </div>
      </header>

      <div className="create-layout">
        {/* ============================================ */}
        {/* Main column                                   */}
        {/* ============================================ */}
        <div className="create-main">
          {/* ---- STEP 1: Details ---- */}
          <section className="create-card">
            <div className="create-card-header">
              <span className="create-step">1</span>
              <div>
                <h2 className="create-card-title">Event Details</h2>
                <p className="create-card-subtitle">
                  Basic information customers will see
                </p>
              </div>
            </div>

            <div className="create-field">
              <label className="create-label" htmlFor="ce-title">
                Title <span className="create-required">*</span>
              </label>
              <input
                id="ce-title"
                className={`create-input ${errors.title ? "error" : ""}`}
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value });
                  if (errors.title)
                    setErrors((prev) => ({ ...prev, title: "" }));
                }}
                placeholder="e.g. Taprobane Live 2026"
              />
              {errors.title && (
                <span className="create-error">{errors.title}</span>
              )}
            </div>

            <div className="create-field">
              <label className="create-label" htmlFor="ce-desc">
                Description <span className="create-required">*</span>
              </label>
              <textarea
                id="ce-desc"
                className={`create-input create-textarea ${
                  errors.description ? "error" : ""
                }`}
                value={form.description}
                onChange={(e) => {
                  setForm({ ...form, description: e.target.value });
                  if (errors.description)
                    setErrors((prev) => ({ ...prev, description: "" }));
                }}
                placeholder="What makes this event special?"
                rows={4}
              />
              {errors.description && (
                <span className="create-error">{errors.description}</span>
              )}
            </div>

            <div className="create-grid-2">
              <div className="create-field">
                <label className="create-label" htmlFor="ce-time">
                  Event Time <span className="create-required">*</span>
                </label>
                <input
                  id="ce-time"
                  className={`create-input ${errors.eventTime ? "error" : ""}`}
                  value={form.eventTime}
                  onChange={(e) => {
                    setForm({ ...form, eventTime: e.target.value });
                    if (errors.eventTime)
                      setErrors((prev) => ({ ...prev, eventTime: "" }));
                  }}
                  placeholder="e.g. 19:30"
                />
                {errors.eventTime && (
                  <span className="create-error">{errors.eventTime}</span>
                )}
              </div>

              <div className="create-field">
                <label className="create-label" htmlFor="ce-loc">
                  Location <span className="create-required">*</span>
                </label>
                <input
                  id="ce-loc"
                  className={`create-input ${errors.location ? "error" : ""}`}
                  value={form.location}
                  onChange={(e) => {
                    setForm({ ...form, location: e.target.value });
                    if (errors.location)
                      setErrors((prev) => ({ ...prev, location: "" }));
                  }}
                  placeholder="e.g. Messukeskus, Helsinki"
                />
                {errors.location && (
                  <span className="create-error">{errors.location}</span>
                )}
              </div>
            </div>

            {/* ---- Sequence Code ---- */}
            <div className="create-field">
              <label className="create-label" htmlFor="ce-seq">
                Sequence Code <span className="create-required">*</span>
              </label>
              <div className="create-sequence-input-wrap">
                <input
                  id="ce-seq"
                  className={`create-input create-input-mono ${
                    errors.sequenceCode ||
                    sequenceCheck.status === "unavailable"
                      ? "error"
                      : ""
                  }`}
                  value={form.sequenceCode}
                  onChange={(e) => {
                    const v = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "");
                    setForm({ ...form, sequenceCode: v });
                    if (errors.sequenceCode)
                      setErrors((prev) => ({ ...prev, sequenceCode: "" }));
                  }}
                  placeholder="e.g. taprosa2026"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                />

                {sequenceCheck.status === "checking" && (
                  <span className="create-sequence-status checking">
                    <span className="create-sequence-spinner" />
                  </span>
                )}
                {sequenceCheck.status === "available" && (
                  <span className="create-sequence-status available">
                    <CheckIcon />
                  </span>
                )}
                {sequenceCheck.status === "unavailable" && (
                  <span className="create-sequence-status unavailable">
                    <CloseIcon />
                  </span>
                )}
              </div>

              <span className="create-hint">
                Prefix used for every ticket number sold for this event (e.g.{" "}
                <code>taprosa2026</code> → <code>taprosa20260010001</code>).
                Cannot be changed once tickets are sold.
              </span>

              {sequenceCheck.status === "available" && (
                <span className="create-message create-message-success">
                  Sequence code available
                </span>
              )}
              {sequenceCheck.status === "unavailable" &&
                !errors.sequenceCode && (
                  <span className="create-error">
                    {sequenceCheck.message}
                  </span>
                )}
              {errors.sequenceCode && (
                <span className="create-error">{errors.sequenceCode}</span>
              )}
            </div>

            <div className="create-field">
              <label className="create-label" htmlFor="ce-vis">
                Visibility
              </label>
              <div className="create-visibility-options">
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
                      desc: "Archived, no longer selling",
                    },
                  ] as const
                ).map((opt) => {
                  const selected = form.visibility === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`create-visibility-card ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() =>
                        setForm({ ...form, visibility: opt.key })
                      }
                    >
                      <div className="create-visibility-radio">
                        {selected && (
                          <span className="create-visibility-radio-dot" />
                        )}
                      </div>
                      <div>
                        <div className="create-visibility-label">
                          {opt.label}
                        </div>
                        <div className="create-visibility-desc">
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- STEP 2: Tickets ---- */}
          <section className="create-card">
            <div className="create-card-header">
              <span className="create-step">2</span>
              <div>
                <h2 className="create-card-title">Tickets</h2>
                <p className="create-card-subtitle">
                  Select categories and types, then set price and limit for
                  each
                </p>
              </div>
            </div>

            {errors.tickets && (
              <div className="create-banner create-banner-error">
                {errors.tickets}
              </div>
            )}

            {categoriesLoading && (
              <p className="create-muted">Loading categories…</p>
            )}

            {!categoriesLoading && categories.length === 0 && (
              <p className="create-muted">
                No ticket categories yet. Create them first in{" "}
                <Link href="/super-admin/ticket-categories">
                  Ticket Categories
                </Link>
                .
              </p>
            )}

            <div className="create-categories">
              {categories.map((cat) => {
                const catSelected = selectedCategories.includes(cat.id);
                return (
                  <div
                    key={cat.id}
                    className={`create-category ${
                      catSelected ? "open" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="create-category-header"
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <span
                        className={`create-checkbox ${
                          catSelected ? "checked" : ""
                        }`}
                      >
                        {catSelected && <CheckIcon />}
                      </span>
                      <span className="create-category-name">{cat.name}</span>
                      <span className="create-category-count">
                        {cat.ticketTypes.length}{" "}
                        {cat.ticketTypes.length === 1 ? "type" : "types"}
                      </span>
                    </button>

                    {catSelected && (
                      <div className="create-types">
                        {cat.ticketTypes.length === 0 ? (
                          <p className="create-muted create-muted-sm">
                            No types in this category.
                          </p>
                        ) : (
                          cat.ticketTypes.map((type) => {
                            const typeSelected = selectedTypes.includes(type.id);
                            const ticket = eventTickets.find(
                              (t) => t.typeId === type.id
                            );

                            return (
                              <div
                                key={type.id}
                                className={`create-type ${
                                  typeSelected ? "selected" : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  className="create-type-header"
                                  onClick={() =>
                                    toggleType(cat.id, type.id)
                                  }
                                >
                                  <span
                                    className={`create-checkbox create-checkbox-sm ${
                                      typeSelected ? "checked" : ""
                                    }`}
                                  >
                                    {typeSelected && <CheckIcon />}
                                  </span>
                                  <span className="create-type-name">
                                    {type.name}
                                  </span>
                                </button>

                                {typeSelected && ticket && (
                                  <div className="create-type-inputs">
                                    <div className="create-type-input">
                                      <label
                                        className="create-label-sm"
                                        htmlFor={`price-${type.id}`}
                                      >
                                        Price (€)
                                      </label>
                                      <input
                                        id={`price-${type.id}`}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="create-input"
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

                                    <div className="create-type-input">
                                      <label
                                        className="create-label-sm"
                                        htmlFor={`limit-${type.id}`}
                                      >
                                        Limit
                                      </label>
                                      <input
                                        id={`limit-${type.id}`}
                                        type="number"
                                        min="1"
                                        step="1"
                                        className="create-input"
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
          <section className="create-card">
            <div className="create-card-header">
              <span className="create-step">3</span>
              <div>
                <h2 className="create-card-title">Images</h2>
                <p className="create-card-subtitle">
                  Cover image + up to {MAX_GALLERY} gallery images
                </p>
              </div>
            </div>

            <div className="create-field">
              <label className="create-label">Cover Image</label>
              <label className="create-dropzone">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleCoverChange(e.target.files?.[0] || null)
                  }
                  hidden
                />
                {coverPreview ? (
                  <div className="create-dropzone-preview">
                    <img src={coverPreview} alt="Cover preview" />
                    <span className="create-dropzone-change">
                      Change cover
                    </span>
                  </div>
                ) : (
                  <div className="create-dropzone-empty">
                    <UploadIcon />
                    <span className="create-dropzone-title">
                      Click to upload
                    </span>
                    <span className="create-dropzone-hint">
                      Recommended 16:9, up to 5 MB
                    </span>
                  </div>
                )}
              </label>
            </div>

            <div className="create-field">
              <label className="create-label">
                Gallery Images ({galleryFiles.length}/{MAX_GALLERY})
              </label>
              <label className="create-dropzone create-dropzone-gallery">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleGalleryChange(e.target.files)}
                  hidden
                />
                <div className="create-dropzone-empty">
                  <UploadIcon />
                  <span className="create-dropzone-title">
                    Click to add gallery images
                  </span>
                  <span className="create-dropzone-hint">
                    You can select multiple files
                  </span>
                </div>
              </label>

              {galleryPreviews.length > 0 && (
                <div className="create-gallery-preview">
                  {galleryPreviews.map((src, i) => (
                    <div key={i} className="create-gallery-preview-item">
                      <img src={src} alt={`Gallery ${i + 1}`} />
                      <button
                        type="button"
                        className="create-gallery-remove"
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
        </div>

        {/* ============================================ */}
        {/* Preview column                                */}
        {/* ============================================ */}
        <aside className="create-aside">
          <div className="create-preview">
            <div className="create-preview-label">Live preview</div>

            <div className="create-preview-card">
              <div className="create-preview-image">
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover" />
                ) : (
                  <div className="create-preview-image-placeholder">
                    <ImageIcon />
                  </div>
                )}
              </div>

              <div className="create-preview-body">
                <h3 className="create-preview-title">
                  {form.title || "Event title"}
                </h3>

                {form.eventTime || form.location ? (
                  <div className="create-preview-meta">
                    {form.eventTime && (
                      <span className="create-preview-meta-item">
                        <ClockIcon />
                        {form.eventTime}
                      </span>
                    )}
                    {form.location && (
                      <span className="create-preview-meta-item">
                        <PinIcon />
                        {form.location}
                      </span>
                    )}
                  </div>
                ) : null}

                {priceRange && (
                  <div className="create-preview-price">
                    {priceRange.min === priceRange.max
                      ? `€${(priceRange.min / 100).toFixed(2)}`
                      : `€${(priceRange.min / 100).toFixed(0)} – €${(
                          priceRange.max / 100
                        ).toFixed(0)}`}
                  </div>
                )}

                {form.sequenceCode && (
                  <div className="create-preview-seq">
                    <span className="create-preview-seq-label">
                      Ticket prefix
                    </span>
                    <span className="create-preview-seq-value">
                      {form.sequenceCode}
                    </span>
                  </div>
                )}

                <div className="create-preview-visibility">
                  <span className="create-preview-meta-count">
                    {eventTickets.length}{" "}
                    {eventTickets.length === 1
                      ? "ticket type"
                      : "ticket types"}
                  </span>
                  <span
                    className={`create-preview-pill create-preview-pill-${form.visibility}`}
                  >
                    {form.visibility.charAt(0).toUpperCase() +
                      form.visibility.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            <p className="create-preview-note">
              This is how customers will see your event on the homepage.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Sticky action bar ---- */}
      <div className="create-actions">
        <div className="create-actions-inner">
          <Link
            href="/super-admin/events"
            className="create-btn create-btn-ghost"
          >
            Cancel
          </Link>
          <button
            className="create-btn create-btn-primary"
            onClick={submit}
            disabled={loading || sequenceCheck.status === "checking"}
          >
            {loading ? "Creating…" : "Create Event"}
            {!loading && <ArrowRightIcon />}
          </button>
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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