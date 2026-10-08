import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { raffles } from "@/db/schema/raffles";
import { raffleWinners } from "@/db/schema/raffleWinners";
import { events } from "@/db/schema/events";
import { orders } from "@/db/schema/orders";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const MAX_NAME_LEN = 128;
const MIN_WINNER_COUNT = 1;
const MAX_WINNER_COUNT = 500;

/* ======================================================
   GET /api/super-admin/raffles
   ------------------------------------------------------
   List all raffles (optionally filtered by event).

   Query params:
     ?eventId=6    → only raffles for that event

   Response includes:
     - raffles[]           — the list, newest first
     - poolByEvent         — map of eventId → distinct paid
                             customer count. Used by the UI to
                             preview how many winners are
                             possible before drawing.
     - availableEvents[]   — events that have at least one paid
                             order, for the create-modal dropdown.
                             Sorted newest first.
   ====================================================== */
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const eventIdRaw = req.nextUrl.searchParams.get("eventId");
    const eventIdFilter =
      eventIdRaw && eventIdRaw !== "all" ? Number(eventIdRaw) : null;

    const conditions = [];
    if (eventIdFilter !== null && Number.isInteger(eventIdFilter)) {
      conditions.push(eq(raffles.eventId, eventIdFilter));
    }

    const rows = await db
      .select({
        id: raffles.id,
        eventId: raffles.eventId,
        name: raffles.name,
        winnerCount: raffles.winnerCount,
        status: raffles.status,
        drawnAt: raffles.drawnAt,
        createdAt: raffles.createdAt,
        updatedAt: raffles.updatedAt,
        eventTitle: events.title,
        createdByEmail: users.email,
        // Actual winners stored (null before first draw)
        actualWinnerCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${raffleWinners}
          WHERE ${raffleWinners.raffleId} = ${raffles.id}
        )`,
      })
      .from(raffles)
      .leftJoin(events, eq(events.id, raffles.eventId))
      .leftJoin(users, eq(users.id, raffles.createdBy))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(raffles.id));

    // ---- Pool sizes per event ----
    // Distinct paid customer emails (lowercased) per event.
    // This is the total possible-winner universe at any moment.
    const poolRows = await db
      .select({
        eventId: orders.eventId,
        pool: sql<number>`COUNT(DISTINCT LOWER(${orders.customerEmail}))::int`,
      })
      .from(orders)
      .where(eq(orders.status, "paid"))
      .groupBy(orders.eventId);

    const poolByEvent: Record<number, number> = {};
    for (const p of poolRows) {
      poolByEvent[p.eventId] = p.pool;
    }

    // ---- Events with paid customers (for the create dropdown) ----
    const availableEvents = await db
      .selectDistinct({
        id: events.id,
        title: events.title,
      })
      .from(events)
      .innerJoin(orders, eq(orders.eventId, events.id))
      .where(eq(orders.status, "paid"))
      .orderBy(desc(events.id));

    return NextResponse.json({
      raffles: rows,
      poolByEvent,
      availableEvents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List raffles error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   POST /api/super-admin/raffles
   ------------------------------------------------------
   Create a new raffle.

   Body:
     { eventId: number,
       name: string,
       winnerCount: number }

   Role: SUPER_ADMIN only (create is restricted).

   Notes:
     - Multiple raffles per event are allowed.
     - winnerCount is stored as-is. If it exceeds the pool at
       draw time, the draw will cap at the pool size.
     - We do NOT snapshot the pool here — customers can keep
       buying between creation and draw, and the draw should
       always use the freshest paid-orders universe.
   ====================================================== */
export async function POST(req: NextRequest) {
  try {
    // ⭐ Create is SUPER_ADMIN only
    const session = getSession(req, ["SUPER_ADMIN"]);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const eventIdRaw = (body as { eventId?: unknown }).eventId;
    const nameRaw = (body as { name?: unknown }).name;
    const winnerCountRaw = (body as { winnerCount?: unknown }).winnerCount;

    const eventId = Number(eventIdRaw);
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const winnerCount = Number(winnerCountRaw);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "eventId is required", code: "MISSING_EVENT" },
        { status: 400 }
      );
    }
    if (!name || name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        {
          error: `Name must be 1–${MAX_NAME_LEN} characters`,
          code: "INVALID_NAME",
        },
        { status: 400 }
      );
    }
    if (
      !Number.isInteger(winnerCount) ||
      winnerCount < MIN_WINNER_COUNT ||
      winnerCount > MAX_WINNER_COUNT
    ) {
      return NextResponse.json(
        {
          error: `winnerCount must be an integer between ${MIN_WINNER_COUNT} and ${MAX_WINNER_COUNT}`,
          code: "INVALID_WINNER_COUNT",
        },
        { status: 400 }
      );
    }

    // ---- Verify the event exists ----
    const [ev] = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, eventId));
    if (!ev) {
      return NextResponse.json(
        { error: "Event not found", code: "EVENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // ---- Snapshot the current pool size for the response ----
    // Not stored — just returned so the admin sees "you have
    // 47 paid customers, so 10 winners is fine" (or a warning).
    const [poolRow] = await db
      .select({
        pool: sql<number>`COUNT(DISTINCT LOWER(${orders.customerEmail}))::int`,
      })
      .from(orders)
      .where(
        and(eq(orders.eventId, eventId), eq(orders.status, "paid"))
      );

    const pool = poolRow?.pool ?? 0;

    // ---- Insert ----
    const [created] = await db
      .insert(raffles)
      .values({
        eventId,
        name,
        winnerCount,
        status: "draft",
        createdBy: session.userId,
      })
      .returning();

    return NextResponse.json(
      {
        raffle: {
          id: created.id,
          eventId: created.eventId,
          eventTitle: ev.title,
          name: created.name,
          winnerCount: created.winnerCount,
          status: created.status,
          drawnAt: created.drawnAt,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        // Snapshot info so the UI can immediately show a hint
        // like "47 paid customers · 10 winners requested"
        currentPoolSize: pool,
        canDrawNow: pool >= 1,
        willCapAtPool: winnerCount > pool,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create raffle error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}