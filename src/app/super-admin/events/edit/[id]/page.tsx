"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./edit.css";
import EditEventForm from "./EditEventForm";

type FormState = {
  title: string;
  description: string;
  eventTime: string;
  location: string;
  visibility: "ongoing" | "past" | "draft";
  coverImage: string;
  galleryImages: string[];
  sequenceCode: string;
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
  key: string;
  id?: number;
  type: ExternalLinkType;
  label: string;
  url: string;
  sortOrder: number;
};

type Category = {
  id: number;
  name: string;
  ticketTypes: { id: number; name: string }[];
};

type SelectedTicket = {
  categoryId: number;
  typeId: number;
  price: string;
  limit: string;
};

function generateKey() {
  return Math.random().toString(36).slice(2, 10);
}

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: eventId } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    eventTime: "",
    location: "",
    visibility: "draft",
    coverImage: "",
    galleryImages: [],
    sequenceCode: "",
    pastEventTitle: "",
    pastEventStory: "",
    ticketImageUrl: "",
    ticketImageTextColor: "light",
  });

  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [eventTickets, setEventTickets] = useState<SelectedTicket[]>([]);

  // ---- Sequence code lock state ----
  const [hasSoldTickets, setHasSoldTickets] = useState(false);
  const [soldTicketCount, setSoldTicketCount] = useState(0);

  // ---- Load categories ----
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/super-admin/ticket-categories/list");
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    }
    loadCategories();
  }, []);

  // ---- Load event ----
  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await fetch(
          `/api/super-admin/events/get?id=${eventId}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = await res.json();

        if (!data.event) {
          setError("Event not found");
          setLoading(false);
          setTimeout(() => router.push("/super-admin/events"), 1500);
          return;
        }

        const e = data.event;

        setForm({
          title: e.title || "",
          description: e.description || "",
          eventTime: e.eventTime || "",
          location: e.location || "",
          visibility: e.visibility || "draft",
          coverImage: e.coverImage || "",
          galleryImages: Array.isArray(e.galleryImages) ? e.galleryImages : [],
          sequenceCode: e.sequenceCode || "",
          pastEventTitle: e.pastEventTitle || "",
          pastEventStory: e.pastEventStory || "",
          // ⭐ NEW — load ticket design (fall back to safe defaults)
          ticketImageUrl: e.ticketImageUrl || "",
          ticketImageTextColor:
            e.ticketImageTextColor === "dark" ? "dark" : "light",
        });

        // ---- Load external links ----
        const links: ExternalLink[] = Array.isArray(e.externalLinks)
          ? e.externalLinks.map((l: any) => ({
              key: generateKey(),
              id: Number(l.id),
              type: l.type,
              label: l.label,
              url: l.url,
              sortOrder: Number(l.sortOrder) || 0,
            }))
          : [];
        setExternalLinks(links);

        setHasSoldTickets(!!e.hasSoldTickets);
        setSoldTicketCount(Number(e.soldTicketCount ?? 0));

        const selectedCatIds = [
          ...new Set(e.eventTickets.map((t: any) => Number(t.categoryId))),
        ] as number[];

        const selectedTypeIds = e.eventTickets.map((t: any) =>
          Number(t.typeId)
        ) as number[];

        setSelectedCategories(selectedCatIds);
        setSelectedTypes(selectedTypeIds);

        setEventTickets(
          e.eventTickets.map((t: any) => ({
            categoryId: Number(t.categoryId),
            typeId: Number(t.typeId),
            price: String(t.price),
            limit: String(t.limit),
          }))
        );

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load event");
        setLoading(false);
      }
    }

    loadEvent();
  }, [eventId, router]);

  async function save(links: ExternalLink[]) {
    setSaving(true);
    try {
      // Strip the client-side "key" — the API only needs id + type + label + url + sortOrder
      const linksForApi = links.map((l) => ({
        id: l.id,
        type: l.type,
        label: l.label.trim(),
        url: l.url.trim(),
        sortOrder: l.sortOrder,
      }));

      const res = await fetch("/api/super-admin/events/edit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          id: Number(eventId),
          ...form,
          // ⭐ Ensure ticket design fields are sent explicitly
          ticketImageUrl: form.ticketImageUrl || null,
          ticketImageTextColor: form.ticketImageUrl
            ? form.ticketImageTextColor
            : null,
          eventTickets: eventTickets.map((t) => ({
            categoryId: t.categoryId,
            typeId: t.typeId,
            price: Number(t.price),
            limit: Number(t.limit),
          })),
          externalLinks: linksForApi,
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
      alert("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="edit-page">
        <div className="edit-state">
          <div className="edit-state-spinner" />
          <p className="edit-state-text">Loading event…</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="edit-page">
        <Link href="/super-admin/events" className="edit-back">
          ← Back to Events
        </Link>
        <div className="edit-state">
          <p className="edit-state-title">{error}</p>
          <p className="edit-state-text">
            Redirecting you back to the events list…
          </p>
        </div>
      </div>
    );
  }

  return (
    <EditEventForm
      form={form}
      setForm={setForm}
      categories={categories}
      selectedCategories={selectedCategories}
      setSelectedCategories={setSelectedCategories}
      selectedTypes={selectedTypes}
      setSelectedTypes={setSelectedTypes}
      eventTickets={eventTickets}
      setEventTickets={setEventTickets}
      save={save}
      saving={saving}
      hasSoldTickets={hasSoldTickets}
      soldTicketCount={soldTicketCount}
      externalLinks={externalLinks}
      setExternalLinks={setExternalLinks}
    />
  );
}