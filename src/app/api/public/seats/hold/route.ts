import { NextRequest, NextResponse } from "next/server";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/db/schema/index";
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seatingSections } from "@/db/schema/seatingSections";
import { seats } from "@/db/schema/seats";
import { events } from "@/db/schema/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Tunables ----
const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 min browse hold
const MAX_SEATS_PER_HOLD = 20;
const MAX_HOLD_ATTEMPTS_PER_MIN = 20;
const RATE_WINDOW_MS = 60_000;

/* ======================================================
   In-memory rate limiter
   ------------------------------------------------------
   ⚠️ This is a MINIMAL v1 defense. In serverless (Vercel),
   each instance has its own memory, so an attacker hitting
   N instances gets N × the limit. It still stops the naive
   "loop from one IP" attack, which is the common case.

   To upgrade later: swap for Upstash Redis or a small
   Postgres-based rate-limit table with a sliding window.

   Entries self-clean: after resetAt passes, the next write
   for that key replaces the entry. No unbounded growth
   beyond (unique IPs per minute) which is bounded by
   whatever the network can handle.
   ====================================================== */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_HOLD_ATTEMPTS_PER_MIN) return false;
  entry.count += 1;
  return true;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Leftmost entry is the client IP per proxy convention.
    // (Trust depends on your proxy; Vercel sanitizes this.)
    return forwarded.split(",")[0].trim();
  }
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/* ======================================================
   Token generation
   ------------------------------------------------------
   24 random bytes → 32-char base64url string.
   ~192 bits of entropy. Not guessable.
   ====================================================== */
function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/* ======================================================
   POST /api/public/seats/hold
   ------------------------------------------------------
   Body:
     {
       eventId: number,
       categoryId: number,
       seatIds: number[],
       token?: string          // reuse when re-holding (change quantity)
     }

   Behavior:
     - All requested seats are claimed or NONE are (all-or-nothing).
     - A token from a previous hold is released before the new claim,
       unless it's re-claiming the exact same seats.
     - Concurrent request for the same seat: exactly one wins.
       The loser gets 409 with the list of seats now unavailable.

   Response 200:
     {
       token: string,
       expiresAt: string (ISO),
       seats: [{ id, label }]
     }

   Response 409:
     {
       error: "One or more seats are no longer available",
       code: "SEAT_UNAVAILABLE",
       unavailableSeatIds: number[]
     }
   ====================================================== */

type HoldBody = {
  eventId?: unknown;
  categoryId?: unknown;
  seatIds?: unknown;
  token?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    // ---- Rate limit ----
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: "Too many hold attempts. Please slow down.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    // ---- Parse body ----
    const body = (await req.json().catch(() => null)) as HoldBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const eventId = Number(body.eventId);
    const categoryId = Number(body.categoryId);
    const rawSeatIds = body.seatIds;
    const incomingToken =
      typeof body.token === "string" && body.token.length > 0
        ? body.token
        : null;

    // ---- Validate input ----
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
    if (!Array.isArray(rawSeatIds) || rawSeatIds.length === 0) {
      return NextResponse.json(
        { error: "seatIds must be a non-empty array", code: "INVALID_SEATS" },
        { status: 400 }
      );
    }
    if (rawSeatIds.length > MAX_SEATS_PER_HOLD) {
      return NextResponse.json(
        {
          error: `Cannot hold more than ${MAX_SEATS_PER_HOLD} seats at once`,
          code: "TOO_MANY_SEATS",
        },
        { status: 400 }
      );
    }

    // Normalize: dedupe, integer-check
    const seatIdSet = new Set<number>();
    for (const raw of rawSeatIds) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json(
          { error: "seatIds must contain positive integers", code: "INVALID_SEATS" },
          { status: 400 }
        );
      }
      seatIdSet.add(n);
    }
    const seatIds = Array.from(seatIdSet);

    // ---- Verify event exists ----
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

    // ---- Find the map for (event, category) ----
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
      return NextResponse.json(
        {
          error: "No seating map exists for this event and category",
          code: "NO_MAP",
        },
        { status: 404 }
      );
    }

    // ---- Verify all seatIds belong to this map BEFORE the claim ----
    // Prevents: malicious client sending seat IDs from a different map
    // (or a stale map) to confuse the state machine.
    const existingSeats = await db
      .select({ id: seats.id })
      .from(seats)
      .where(and(inArray(seats.id, seatIds), eq(seats.mapId, map.id)));

    if (existingSeats.length !== seatIds.length) {
      return NextResponse.json(
        {
          error: "One or more seats do not belong to this map",
          code: "SEAT_NOT_ON_MAP",
        },
        { status: 400 }
      );
    }

    // ---- Issue a fresh token (or reuse the incoming one) ----
    const token = incomingToken ?? generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);

    // ---- Atomic claim inside a transaction ----
    // If ANYTHING goes wrong, the whole thing rolls back and the
    // previous state (including the old token's holds) is preserved.
    let claimed: { id: number }[] = [];

    try {
      await db.transaction(async (tx) => {
        // STEP 1 — Release the old token's holds on seats NOT in the
        // new list. Seats that ARE in the new list skip this step and
        // are re-claimed in-place (no availability gap).
        if (incomingToken) {
          await tx
            .update(seats)
            .set({
              heldByToken: null,
              holdExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(seats.heldByToken, incomingToken),
                notInArray(seats.id, seatIds)
              )
            );
        }

        // STEP 2 — Atomic claim.
        // The WHERE re-evaluates at write time; Postgres row-locks
        // serialize concurrent claims for the same seat. Exactly one
        // transaction can UPDATE a given row — everyone else's row
        // simply doesn't match after the lock releases, and their
        // RETURNING set comes back short.
        const claimedRows = await tx
          .update(seats)
          .set({
            heldByToken: token,
            holdExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              inArray(seats.id, seatIds),
              eq(seats.mapId, map.id),
              eq(seats.isBlocked, false),
              isNull(seats.bookedOrderId),
              // Available OR expired hold OR our own hold (re-claim)
              or(
                isNull(seats.holdExpiresAt),
                lt(seats.holdExpiresAt, now),
                incomingToken
                  ? eq(seats.heldByToken, incomingToken)
                  : isNull(seats.heldByToken)
              )
            )
          )
          .returning({ id: seats.id });

        if (claimedRows.length !== seatIds.length) {
          // Signal to roll back. The custom error is caught below.
          const err = new Error("SEAT_UNAVAILABLE") as Error & {
            _unavailableAfterRollback?: boolean;
          };
          err._unavailableAfterRollback = true;
          throw err;
        }

        claimed = claimedRows;
      });
    } catch (err: any) {
      if (err?.message === "SEAT_UNAVAILABLE") {
        // Rolled back. Now (outside the transaction) figure out which
        // seats are currently unavailable — this is best-effort and
        // purely for the client's error message; slight race is fine.
        const nowDate = new Date();
        const stillAvailable = await db
          .select({ id: seats.id })
          .from(seats)
          .where(
            and(
              inArray(seats.id, seatIds),
              eq(seats.isBlocked, false),
              isNull(seats.bookedOrderId),
              or(
                isNull(seats.holdExpiresAt),
                lt(seats.holdExpiresAt, nowDate)
              )
            )
          );

        const availableSet = new Set(stillAvailable.map((s) => s.id));
        const unavailableSeatIds = seatIds.filter(
          (id) => !availableSet.has(id)
        );

        return NextResponse.json(
          {
            error: "One or more seats are no longer available",
            code: "SEAT_UNAVAILABLE",
            unavailableSeatIds,
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // ---- Fetch seat labels for the response ----
    // Join sections to get the section label so we can compose the
    // customer-facing "Left-A1" (or "A1" for single Main section).
    const sectionsWithSeats = await db
      .select({
        sectionId: seatingSections.id,
        sectionLabel: seatingSections.label,
        seatId: seats.id,
        rowLabel: seats.rowLabel,
        numberLabel: seats.numberLabel,
      })
      .from(seats)
      .leftJoin(seatingSections, eq(seatingSections.id, seats.sectionId))
      .where(inArray(seats.id, seatIds))
      .orderBy(asc(seats.sectionId), asc(seats.rowOrder), asc(seats.numberLabel));

    // Same hide-prefix rule as /availability
    const totalSections = await db
      .select({ id: seatingSections.id })
      .from(seatingSections)
      .where(eq(seatingSections.mapId, map.id));
    const multiSection = totalSections.length > 1;
    const singleMainSection =
      totalSections.length === 1 &&
      (sectionsWithSeats[0]?.sectionLabel ?? "").toLowerCase() === "main";
    const hidePrefix = !multiSection || singleMainSection;

    const seatsOut = sectionsWithSeats.map((s) => ({
      id: s.seatId,
      label: hidePrefix
        ? `${s.rowLabel}${s.numberLabel}`
        : `${s.sectionLabel}-${s.rowLabel}${s.numberLabel}`,
    }));

    return NextResponse.json(
      {
        token,
        expiresAt: expiresAt.toISOString(),
        seats: seatsOut,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("Seat hold error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}