import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seats } from "@/db/schema/seats";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ======================================================
   PATCH /api/super-admin/seating-maps/[id]/seats/[seatId]

   Toggle or set isBlocked on a single seat — the "click a seat
   to block it" feature in the admin editor.

   Body:
     { isBlocked: boolean }

   Safety rails:
     - Cannot block a seat that is BOOKED (an order owns it).
       Unblocking is always allowed.
     - Cannot block a seat that has an ACTIVE HOLD (a customer is
       mid-checkout). Blocking would yank the seat out from under
       them silently. Wait 5 min or expire the hold first.

   Both rails only apply to turning isBlocked ON. Turning it OFF
   (unblocking) is always permitted.
   ====================================================== */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; seatId: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const raw = await params;
    console.log("[seat-toggle] params =", raw); // ⭐ DEBUG

    const { id, seatId: seatIdRaw } = await params;
    const mapId = parseId(id);
    const seatId = parseId(seatIdRaw);

    if (mapId === null) {
      return NextResponse.json({ error: "Invalid map id" }, { status: 400 });
    }
    if (seatId === null) {
      return NextResponse.json({ error: "Invalid seat id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const isBlockedRaw = (body as { isBlocked?: unknown }).isBlocked;
    if (typeof isBlockedRaw !== "boolean") {
      return NextResponse.json(
        {
          error: "isBlocked must be a boolean",
          code: "INVALID_IS_BLOCKED",
        },
        { status: 400 }
      );
    }
    const isBlocked = isBlockedRaw;

    // ---- Verify map exists ----
    const [map] = await db
      .select({ id: seatingMaps.id })
      .from(seatingMaps)
      .where(eq(seatingMaps.id, mapId));
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    // ---- Load the seat + verify it belongs to this map ----
    const [seat] = await db
      .select()
      .from(seats)
      .where(and(eq(seats.id, seatId), eq(seats.mapId, mapId)));

    if (!seat) {
      return NextResponse.json(
        { error: "Seat not found on this map", code: "SEAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // ---- Idempotent: if already in the desired state, return early ----
    if (seat.isBlocked === isBlocked) {
      return NextResponse.json({
        ok: true,
        seat: {
          id: seat.id,
          isBlocked: seat.isBlocked,
        },
        unchanged: true,
      });
    }

    // ---- Safety rails (only when blocking) ----
    if (isBlocked) {
      if (seat.bookedOrderId !== null) {
        return NextResponse.json(
          {
            error:
              "Cannot block a seat that is already booked by an order. Refund or cancel that order first.",
            code: "SEAT_BOOKED",
          },
          { status: 409 }
        );
      }

      const now = new Date();
      if (seat.holdExpiresAt !== null && seat.holdExpiresAt > now) {
        return NextResponse.json(
          {
            error:
              "Cannot block a seat with an active hold. A customer is currently checking out. Try again in a few minutes.",
            code: "SEAT_HELD",
          },
          { status: 409 }
        );
      }
    }

    // ---- Apply ----
    // Conditional UPDATE for extra safety: the WHERE re-checks the
    // state at write time, so a concurrent checkout that grabs this
    // seat between our SELECT and UPDATE can't slip through.
    const updated = await db
      .update(seats)
      .set({ isBlocked, updatedAt: new Date() })
      .where(
        and(
          eq(seats.id, seatId),
          eq(seats.mapId, mapId),
          // Only allow blocking if still unbooked at write time.
          // (For unblocking, this condition is skipped.)
          isBlocked
            ? sql`${seats.bookedOrderId} IS NULL`
            : sql`true`
        )
      )
      .returning({ id: seats.id, isBlocked: seats.isBlocked });

    if (updated.length === 0) {
      return NextResponse.json(
        {
          error:
            "Seat state changed while you were editing. Refresh and try again.",
          code: "SEAT_RACE",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      seat: {
        id: updated[0].id,
        isBlocked: updated[0].isBlocked,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Toggle seat block error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}