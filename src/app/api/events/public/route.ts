import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eq, inArray, desc } from "drizzle-orm";

export async function GET() {
  try {
    // ⭐ Fetch only public events (ongoing + past)
    const eventRows = await db
      .select()
      .from(events)
      .where(
        inArray(events.visibility, ["ongoing", "past"])
      )
      .orderBy(desc(events.id)); // newest first

    const fullEvents = [];

    for (const e of eventRows) {
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
        .leftJoin(
          ticketTypes,
          eq(eventTickets.typeId, ticketTypes.id)
        )
        .where(eq(eventTickets.eventId, e.id));

      fullEvents.push({
        id: e.id,
        title: e.title,
        description: e.description,
        eventTime: e.eventTime,     // ⭐ updated
        location: e.location,       // ⭐ updated
        visibility: e.visibility,
        coverImage: e.coverImage,
        galleryImages: e.galleryImages ?? [],
        eventTickets: tickets,
      });
    }

    return NextResponse.json({ events: fullEvents }, { status: 200 });
  } catch (err) {
    console.error("Public events error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
