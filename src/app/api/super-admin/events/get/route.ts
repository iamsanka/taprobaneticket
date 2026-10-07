import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { eventSequences } from "@/db/schema/eventSequences";
import { eventExternalLinks } from "@/db/schema/eventExternalLinks";
import { orderTickets } from "@/db/schema/orderTickets";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eq, sql, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // ---- Fetch event ----
    const eventRows = await db
      .select()
      .from(events)
      .where(eq(events.id, id));

    if (eventRows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventRows[0];

    // ---- Fetch event tickets ----
    const tickets = await db
      .select({
        id: eventTickets.id,
        categoryId: eventTickets.categoryId,
        typeId: eventTickets.typeId,
        price: eventTickets.price,
        limit: eventTickets.limit,
        categoryName: ticketCategories.name,
        typeName: ticketTypes.name,
      })
      .from(eventTickets)
      .leftJoin(
        ticketCategories,
        eq(eventTickets.categoryId, ticketCategories.id)
      )
      .leftJoin(ticketTypes, eq(eventTickets.typeId, ticketTypes.id))
      .where(eq(eventTickets.eventId, id));

    // ---- Fetch sequence code ----
    const sequenceRows = await db
      .select()
      .from(eventSequences)
      .where(eq(eventSequences.eventId, id));

    const sequenceCode = sequenceRows[0]?.sequenceCode ?? "";

    // ---- Check if any tickets have been sold for this event ----
    const soldResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orderTickets)
      .where(eq(orderTickets.eventId, id));

    const soldTicketCount = Number(soldResult[0]?.count ?? 0);
    const hasSoldTickets = soldTicketCount > 0;

    // ---- Fetch external links (for past events) ----
    const links = await db
      .select({
        id: eventExternalLinks.id,
        type: eventExternalLinks.type,
        label: eventExternalLinks.label,
        url: eventExternalLinks.url,
        sortOrder: eventExternalLinks.sortOrder,
      })
      .from(eventExternalLinks)
      .where(eq(eventExternalLinks.eventId, id))
      .orderBy(
        asc(eventExternalLinks.sortOrder),
        asc(eventExternalLinks.id)
      );

    return NextResponse.json(
      {
        event: {
          ...event,
          eventTime: event.eventTime,
          location: event.location,
          eventTickets: tickets,
          sequenceCode,
          hasSoldTickets,
          soldTicketCount,

          // ⭐ Past event showcase fields
          pastEventTitle: event.pastEventTitle ?? "",
          pastEventStory: event.pastEventStory ?? "",
          externalLinks: links,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Event GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}