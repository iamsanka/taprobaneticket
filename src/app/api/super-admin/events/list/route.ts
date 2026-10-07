import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    // ⭐ Fetch all events
    const eventRows = await db.select().from(events);

    const fullEvents = [];

    for (const e of eventRows) {
      // ⭐ Fetch tickets for each event
      const tickets = await db
        .select({
          id: eventTickets.id,
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
        .where(eq(eventTickets.eventId, e.id));

      // ⭐ Push full event object
      fullEvents.push({
        ...e,

        // ⭐ NEW FIELDS
        eventTime: e.eventTime,
        location: e.location,

        eventTickets: tickets,
      });
    }

    return NextResponse.json({ events: fullEvents }, { status: 200 });
  } catch (err) {
    console.error("Event list error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
