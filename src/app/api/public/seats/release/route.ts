import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { seats } from "@/db/schema/seats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Tunables ----
const MAX_RELEASE_ATTEMPTS_PER_MIN = 60;
const RATE_WINDOW_MS = 60_000;

/* ======================================================
   In-memory rate limiter
   ------------------------------------------------------
   Same caveats as File 36: per-instance in serverless.
   Upgrade to Redis later. Release is a much cheaper call
   than hold, so a higher limit is fine — this is just a
   sanity guard against runaway scripts.
   ====================================================== */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_RELEASE_ATTEMPTS_PER_MIN) return false;
  entry.count += 1;
  return true;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/* ======================================================
   POST /api/public/seats/release
   ------------------------------------------------------
   Body (both forms supported):

     { token: "abc..." }                      ← release ALL
     { token: "abc...", seatIds: [1, 2] }     ← release subset

   Behavior:
     - Idempotent. If the token holds no seats, returns
       { released: 0 } with 200. Never errors on unknown tokens.
     - Never releases another customer's hold: the WHERE clause
       requires held_by_token = $token. A malicious caller would
       need to guess a 192-bit token, which is infeasible.
     - Safe to call after expiry: the rows are already free, the
       UPDATE just matches 0 rows and returns { released: 0 }.
     - Also clears hold_expires_at so the seat is "clean" — no
       leftover timestamp to confuse future debugging.

   Response 200:
     { released: number, seatIds: number[] }
   ====================================================== */

type ReleaseBody = {
  token?: unknown;
  seatIds?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    // ---- Rate limit ----
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: "Too many release attempts. Please slow down.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    // ---- Parse body ----
    const body = (await req.json().catch(() => null)) as ReleaseBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const token = typeof body.token === "string" ? body.token : "";
    if (!token || token.length < 8 || token.length > 128) {
      return NextResponse.json(
        { error: "token is required", code: "MISSING_TOKEN" },
        { status: 400 }
      );
    }

    // ---- Optional seatIds subset ----
    // Empty array is treated the same as "no subset" — release all.
    // This makes the client code simpler: it can always send the
    // current selection, even if the customer just cleared it.
    let seatIds: number[] | null = null;
    if (Array.isArray(body.seatIds) && body.seatIds.length > 0) {
      const parsed = new Set<number>();
      for (const raw of body.seatIds) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json(
            {
              error: "seatIds must contain positive integers",
              code: "INVALID_SEATS",
            },
            { status: 400 }
          );
        }
        parsed.add(n);
      }
      seatIds = Array.from(parsed);
    }

    // ---- Release ----
    // The WHERE requires held_by_token = $token, which is the only
    // thing that prevents one customer from releasing another's
    // hold. Even if the client sends 100 seat IDs belonging to
    // different customers, only the ones held by THIS token match.
    const whereClause =
      seatIds === null
        ? eq(seats.heldByToken, token)
        : and(eq(seats.heldByToken, token), inArray(seats.id, seatIds));

    const released = await db
      .update(seats)
      .set({
        heldByToken: null,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(whereClause)
      .returning({ id: seats.id });

    return NextResponse.json(
      {
        released: released.length,
        seatIds: released.map((r) => r.id),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("Seat release error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}