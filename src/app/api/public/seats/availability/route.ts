import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seatingSections } from "@/db/schema/seatingSections";
import { seats } from "@/db/schema/seats";
import { events } from "@/db/schema/events";

export const runtime = "nodejs";
// Availability changes constantly — never cache.
export const dynamic = "force-dynamic";

/* ======================================================
   GET /api/public/seats/availability?eventId=X&categoryId=Y
   ------------------------------------------------------
   PUBLIC endpoint — no auth. Called by the customer's seat
   picker before selection.

   Behavior:
     - If no seating map exists for (event, category) →
       returns { hasSeating: false }. This is NOT an error:
       it simply means the category is general admission, or
       the admin hasn't set up a layout for it yet.

     - If a map exists → returns the full structure with each
       seat's current state (available / blocked / held / booked).

   Privacy:
     - Never exposes bookedOrderId, heldByToken, or holdExpiresAt.
       Only the derived `state` enum goes out.

   Caching:
     - Cache-Control: no-store. The picker must always see fresh
       state, otherwise two customers could both think a seat
       is available.
   ====================================================== */

export async function GET(req: NextRequest) {
  try {
    const eventIdRaw = req.nextUrl.searchParams.get("eventId");
    const categoryIdRaw = req.nextUrl.searchParams.get("categoryId");

    const eventId = Number(eventIdRaw);
    const categoryId = Number(categoryIdRaw);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "eventId is required", code: "MISSING_EVENT" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { error: "categoryId is required", code: "MISSING_CATEGORY" },
        { status: 400 }
      );
    }

    // ---- Verify the event exists (cheap sanity check) ----
    const [ev] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId));
    if (!ev) {
      return NextResponse.json(
        { error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // ---- Find map for (event, category) ----
    const [map] = await db
      .select()
      .from(seatingMaps)
      .where(
        and(
          eq(seatingMaps.eventId, eventId),
          eq(seatingMaps.categoryId, categoryId)
        )
      );

    if (!map) {
      // Not an error — this is a GA category or the admin hasn't
      // set up a seating map yet. The customer UI treats `hasSeating:
      // false` as "no seat selection needed".
      return NextResponse.json(
        { hasSeating: false },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    // ---- Load sections + seats ----
    const sectionRows = await db
      .select()
      .from(seatingSections)
      .where(eq(seatingSections.mapId, map.id))
      .orderBy(asc(seatingSections.displayOrder), asc(seatingSections.id));

    const seatRows = await db
      .select({
        id: seats.id,
        sectionId: seats.sectionId,
        rowLabel: seats.rowLabel,
        rowOrder: seats.rowOrder,
        numberLabel: seats.numberLabel,
        isBlocked: seats.isBlocked,
        bookedOrderId: seats.bookedOrderId,
        holdExpiresAt: seats.holdExpiresAt,
      })
      .from(seats)
      .where(eq(seats.mapId, map.id))
      .orderBy(
        asc(seats.sectionId),
        asc(seats.rowOrder),
        asc(seats.numberLabel)
      );

    const now = new Date();

    // Group seats by section
    const seatsBySection = new Map<number, typeof seatRows>();
    for (const s of seatRows) {
      const arr = seatsBySection.get(s.sectionId) ?? [];
      arr.push(s);
      seatsBySection.set(s.sectionId, arr);
    }

    // If there's only one section labeled "Main", hide the prefix on
    // seat labels. Customers just see "A1", not "Main-A1".
    // Multi-section maps always show the prefix ("Left-A1").
    const multiSection = sectionRows.length > 1;
    const singleMainSection =
      sectionRows.length === 1 &&
      sectionRows[0].label.toLowerCase() === "main";
    const hidePrefix = !multiSection || singleMainSection;

    const sections = sectionRows.map((sec) => ({
      id: sec.id,
      label: sec.label,
      rows: sec.rows,
      colsPerRow: sec.colsPerRow,
      displayOrder: sec.displayOrder,
      colorHex: sec.colorHex,
      seats: (seatsBySection.get(sec.id) ?? []).map((s) => {
        const isBooked = s.bookedOrderId !== null;
        const isHeld =
          !isBooked &&
          s.holdExpiresAt !== null &&
          s.holdExpiresAt > now;

        // Priority order — booked > held > blocked > available.
        // A blocked seat that got booked (via an admin override or
        // legacy data) still shows as booked, which is the truth.
        const state: "booked" | "held" | "blocked" | "available" =
          isBooked
            ? "booked"
            : isHeld
            ? "held"
            : s.isBlocked
            ? "blocked"
            : "available";

        return {
          id: s.id,
          rowLabel: s.rowLabel,
          numberLabel: s.numberLabel,
          // Server-computed state. Client just renders.
          state,
          // Customer-facing label. Composed server-side so the
          // "hide Main prefix" rule lives in one place.
          label: hidePrefix
            ? `${s.rowLabel}${s.numberLabel}`
            : `${sec.label}-${s.rowLabel}${s.numberLabel}`,
        };
      }),
    }));

    return NextResponse.json(
      {
        hasSeating: true,
        map: {
          id: map.id,
          name: map.name,
          stagePosition: map.stagePosition,
          sections,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("Seat availability error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}