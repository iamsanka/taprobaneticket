import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { eventSequences } from "@/db/schema/eventSequences";
import { eventExternalLinks } from "@/db/schema/eventExternalLinks";
import { orderTickets } from "@/db/schema/orderTickets";
import { eq, sql, and, ne, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";

function getSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };
    return decoded.role === "SUPER_ADMIN" ? decoded : null;
  } catch {
    return null;
  }
}

const SEQUENCE_CODE_REGEX = /^[a-z][a-z0-9]{3,31}$/;

const VALID_LINK_TYPES = [
  "youtube",
  "facebook",
  "instagram",
  "photo_album",
  "website",
  "other",
] as const;
type LinkType = (typeof VALID_LINK_TYPES)[number];

type IncomingLink = {
  id?: number;
  type: LinkType;
  label: string;
  url: string;
  sortOrder?: number;
};

export async function PUT(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      id,
      title,
      description,
      eventTime,
      location,
      visibility,
      coverImage,
      galleryImages,
      eventTickets: tickets,
      sequenceCode: rawSequenceCode,
      pastEventTitle,
      pastEventStory,
      externalLinks: rawExternalLinks,
      // ⭐ NEW — ticket design
      ticketImageUrl,
      ticketImageTextColor,
    } = body;

    // ---- Validate required fields ----
    if (!id || !title || !description || !eventTime || !location) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const eventId = Number(id);

    // ---- Check sold tickets ----
    const soldResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orderTickets)
      .where(eq(orderTickets.eventId, eventId));

    const hasSoldTickets = Number(soldResult[0]?.count ?? 0) > 0;

    // ---- Load current sequence ----
    const existingSeq = await db
      .select()
      .from(eventSequences)
      .where(eq(eventSequences.eventId, eventId));

    const currentCode = existingSeq[0]?.sequenceCode ?? "";

    // ---- Resolve incoming sequence code ----
    const incomingTrimmed = rawSequenceCode
      ? String(rawSequenceCode).trim().toLowerCase()
      : "";

    const sequenceCode = incomingTrimmed || currentCode;

    if (!sequenceCode && !hasSoldTickets) {
      return NextResponse.json(
        { error: "Sequence code is required" },
        { status: 400 }
      );
    }

    if (sequenceCode && !SEQUENCE_CODE_REGEX.test(sequenceCode)) {
      return NextResponse.json(
        {
          error:
            "Sequence code must be 4–32 characters, start with a letter, and use only lowercase letters and digits.",
        },
        { status: 400 }
      );
    }

    if (hasSoldTickets && currentCode && sequenceCode !== currentCode) {
      return NextResponse.json(
        {
          error:
            "Sequence code cannot be changed because tickets have already been sold for this event.",
        },
        { status: 409 }
      );
    }

    if (sequenceCode && sequenceCode !== currentCode) {
      const conflict = await db
        .select({ id: eventSequences.id })
        .from(eventSequences)
        .where(
          and(
            eq(eventSequences.sequenceCode, sequenceCode),
            ne(eventSequences.eventId, eventId)
          )
        );

      if (conflict.length > 0) {
        return NextResponse.json(
          { error: "This sequence code is already in use" },
          { status: 409 }
        );
      }
    }

    // ---- Normalize past event fields ----
    const normalizedPastTitle = pastEventTitle
      ? String(pastEventTitle).trim() || null
      : null;

    const normalizedPastStory = pastEventStory
      ? String(pastEventStory).trim() || null
      : null;

    // ⭐ NEW — normalize ticket design fields
    // Rules:
    //   - No image → both fields NULL (classic ticket)
    //   - Image + valid color → both saved
    //   - Image + missing/invalid color → default to "light"
    const hasTicketImage =
      typeof ticketImageUrl === "string" && ticketImageUrl.trim().length > 0;

    let normalizedTextColor: "light" | "dark" = "light";
    if (ticketImageTextColor === "dark") normalizedTextColor = "dark";

    const finalTicketImageUrl = hasTicketImage
      ? ticketImageUrl.trim()
      : null;
    const finalTicketTextColor = hasTicketImage
      ? normalizedTextColor
      : null;

    // ---- Validate + normalize external links ----
    const incomingLinks: IncomingLink[] = Array.isArray(rawExternalLinks)
      ? rawExternalLinks
          .map((l) => {
            const type = String(l?.type ?? "").trim() as LinkType;
            const label = String(l?.label ?? "").trim();
            const url = String(l?.url ?? "").trim();
            const sortOrderRaw = Number(l?.sortOrder);
            const sortOrder = Number.isFinite(sortOrderRaw)
              ? sortOrderRaw
              : 0;
            const idNum = l?.id ? Number(l.id) : undefined;

            return {
              id: idNum,
              type,
              label,
              url,
              sortOrder,
            };
          })
          .filter((l) => l.label && l.url)
      : [];

    for (const l of incomingLinks) {
      if (!VALID_LINK_TYPES.includes(l.type)) {
        return NextResponse.json(
          {
            error: `Invalid link type "${l.type}". Must be one of: ${VALID_LINK_TYPES.join(
              ", "
            )}`,
          },
          { status: 400 }
        );
      }

      if (!/^https?:\/\//i.test(l.url)) {
        return NextResponse.json(
          {
            error: `Link URL must start with http:// or https:// — got "${l.url}"`,
          },
          { status: 400 }
        );
      }

      if (l.label.length > 255) {
        return NextResponse.json(
          { error: "Link labels must be 255 characters or fewer" },
          { status: 400 }
        );
      }

      if (l.url.length > 1000) {
        return NextResponse.json(
          { error: "Link URLs must be 1000 characters or fewer" },
          { status: 400 }
        );
      }
    }

    // ---- Transaction ----
    await db.transaction(async (tx) => {
      // ---- 1. Update event row ----
      await tx
        .update(events)
        .set({
          title,
          description,
          eventTime,
          location,
          visibility,
          coverImage,
          galleryImages,
          pastEventTitle: normalizedPastTitle,
          pastEventStory: normalizedPastStory,
          // ⭐ NEW
          ticketImageUrl: finalTicketImageUrl,
          ticketImageTextColor: finalTicketTextColor,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId));

      // ---- 2. Replace ticket types ----
      await tx
        .delete(eventTickets)
        .where(eq(eventTickets.eventId, eventId));

      if (Array.isArray(tickets)) {
        for (const t of tickets) {
          await tx.insert(eventTickets).values({
            eventId,
            categoryId: t.categoryId,
            typeId: t.typeId,
            price: Number(t.price),
            limit: Number(t.limit),
          });
        }
      }

      // ---- 3. Upsert sequence ----
      if (sequenceCode) {
        if (!existingSeq[0]) {
          await tx.insert(eventSequences).values({
            eventId,
            sequenceCode,
          });
        } else if (sequenceCode !== currentCode) {
          await tx
            .update(eventSequences)
            .set({ sequenceCode })
            .where(eq(eventSequences.eventId, eventId));
        }
      }

      // ---- 4. Sync external links ----
      const existingLinks = await tx
        .select()
        .from(eventExternalLinks)
        .where(eq(eventExternalLinks.eventId, eventId));

      const existingLinkIds = new Set(existingLinks.map((l) => l.id));

      const toUpdate = incomingLinks.filter(
        (l) => l.id !== undefined && existingLinkIds.has(l.id)
      );
      const toInsert = incomingLinks.filter(
        (l) => l.id === undefined || !existingLinkIds.has(l.id)
      );

      const incomingIds = new Set(
        toUpdate.map((l) => l.id).filter(Boolean) as number[]
      );

      const toDeleteIds = existingLinks
        .filter((l) => !incomingIds.has(l.id))
        .map((l) => l.id);

      if (toDeleteIds.length > 0) {
        await tx
          .delete(eventExternalLinks)
          .where(
            and(
              eq(eventExternalLinks.eventId, eventId),
              inArray(eventExternalLinks.id, toDeleteIds)
            )
          );
      }

      for (const l of toUpdate) {
        await tx
          .update(eventExternalLinks)
          .set({
            type: l.type,
            label: l.label,
            url: l.url,
            sortOrder: l.sortOrder ?? 0,
            updatedAt: new Date(),
          })
          .where(eq(eventExternalLinks.id, l.id!));
      }

      for (const l of toInsert) {
        await tx.insert(eventExternalLinks).values({
          eventId,
          type: l.type,
          label: l.label,
          url: l.url,
          sortOrder: l.sortOrder ?? 0,
        });
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("Event edit error:", err);

    if (err?.code === "23505") {
      return NextResponse.json(
        { error: "This sequence code is already in use" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}