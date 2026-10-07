import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { eventExternalLinks } from "@/db/schema/eventExternalLinks";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eq, asc } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const eventRow = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));

    if (eventRow.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const e = eventRow[0];

    const tickets = await db
      .select({
        id: eventTickets.id,
        ticketTypeId: eventTickets.typeId,
        categoryName: ticketCategories.name,
        typeName: ticketTypes.name,
        price: eventTickets.price,
        limit: eventTickets.limit,
      })
      .from(eventTickets)
      .leftJoin(
        ticketCategories,
        eq(eventTickets.categoryId, ticketCategories.id)
      )
      .leftJoin(ticketTypes, eq(eventTickets.typeId, ticketTypes.id))
      .where(eq(eventTickets.eventId, eventId));

    // ---- Fetch external links (only meaningful for past events) ----
    let externalLinks: {
      id: number;
      type: string;
      label: string;
      url: string;
    }[] = [];

    if (e.visibility === "past") {
      const linkRows = await db
        .select({
          id: eventExternalLinks.id,
          type: eventExternalLinks.type,
          label: eventExternalLinks.label,
          url: eventExternalLinks.url,
          sortOrder: eventExternalLinks.sortOrder,
        })
        .from(eventExternalLinks)
        .where(eq(eventExternalLinks.eventId, eventId))
        .orderBy(
          asc(eventExternalLinks.sortOrder),
          asc(eventExternalLinks.id)
        );

      externalLinks = linkRows.map((l) => ({
        id: l.id,
        type: l.type,
        label: l.label,
        url: l.url,
      }));
    }

    return NextResponse.json(
      {
        event: {
          ...e,
          galleryImages: e.galleryImages ?? [],
          eventTickets: tickets,

          // ⭐ Past event showcase — empty strings/array for non-past events
          pastEventTitle: e.pastEventTitle ?? "",
          pastEventStory: e.pastEventStory ?? "",
          externalLinks,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Public event error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}