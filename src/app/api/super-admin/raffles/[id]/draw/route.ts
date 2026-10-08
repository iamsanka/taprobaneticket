import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { raffles } from "@/db/schema/raffles";
import { raffleWinners } from "@/db/schema/raffleWinners";
import { orders } from "@/db/schema/orders";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ======================================================
   Fisher-Yates shuffle with crypto.randomInt
   ------------------------------------------------------
   Uses the OS CSPRNG via Node's crypto module. Every
   permutation is equally likely, and we avoid the biased
   `Math.random()` approach that some naive shuffles use.

   crypto.randomInt(min, max) is end-exclusive on max.
   ====================================================== */
function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ======================================================
   POST /api/super-admin/raffles/[id]/draw
   ------------------------------------------------------
   Draw winners for a raffle.

   Role: SUPER_ADMIN + ADMIN (both can draw).

   Body: none. All the info is on the raffle row.

   Pool:
     Distinct paid customers for the raffle's event, keyed by
     LOWER(customer_email). For each distinct email we keep the
     LATEST paid order's customerName and orderId — so the
     winner snapshot reflects the customer's most recent info.

   Draw:
     - Shuffle the pool with Fisher-Yates + crypto.randomInt
     - Take the first N (N = min(raffle.winnerCount, pool size))
     - Persist winners position-ascending (position 1 = top prize)
     - All-or-nothing via a transaction

   Redraw:
     Allowed. The transaction deletes existing winners for this
     raffle before inserting the new set. The unique(raffleId,
     position) constraint guarantees integrity even under a
     concurrent double-click — the second request either wins
     cleanly or errors out on the constraint (translated to a
     409).

   Response:
     {
       raffle: { id, name, eventId, winnerCount, status, drawnAt, drawnBy },
       winners: [{ position, customerEmail, customerName, orderId }, ...],
       poolSize: number,
       requestedWinners: number,
       actualWinners: number,
       cappedAtPool: boolean
     }

   The `winners` array is sorted position ASC (1 first). The
   client is responsible for revealing them in reverse order
   for dramatic effect.
   ====================================================== */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Both SUPER_ADMIN and ADMIN can draw
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const raffleId = parseId(id);
    if (raffleId === null) {
      return NextResponse.json(
        { error: "Invalid raffle id" },
        { status: 400 }
      );
    }

    // ---- Load raffle ----
    const [raffle] = await db
      .select()
      .from(raffles)
      .where(eq(raffles.id, raffleId));
    if (!raffle) {
      return NextResponse.json(
        { error: "Raffle not found", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    // ---- Load pool ----
    // One row per distinct LOWER(email). We want the newest paid
    // order per email so the name + orderId snapshot is fresh.
    // Approach: fetch all paid orders for the event (small: at most
    // a few hundred to a few thousand), dedupe in JS keeping the
    // last-seen (highest id) per lowercased email.
    const paidOrders = await db
      .select({
        id: orders.id,
        customerEmail: orders.customerEmail,
        customerName: orders.customerName,
      })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, raffle.eventId),
          eq(orders.status, "paid")
        )
      )
      .orderBy(asc(orders.id));

    const byEmail = new Map<
      string,
      { customerEmail: string; customerName: string | null; orderId: number }
    >();
    for (const o of paidOrders) {
      const key = o.customerEmail.toLowerCase();
      // Later rows overwrite earlier ones — newest wins
      byEmail.set(key, {
        customerEmail: o.customerEmail,
        customerName: o.customerName,
        orderId: o.id,
      });
    }

    const pool = Array.from(byEmail.values());
    const poolSize = pool.length;

    if (poolSize === 0) {
      return NextResponse.json(
        {
          error:
            "No eligible customers for this event. A raffle needs at least one paid order.",
          code: "EMPTY_POOL",
        },
        { status: 400 }
      );
    }

    // ---- Determine actual winner count ----
    const requested = raffle.winnerCount;
    const actual = Math.min(requested, poolSize);
    const cappedAtPool = requested > poolSize;

    // ---- Shuffle and take the first `actual` ----
    shuffleInPlace(pool);
    const picked = pool.slice(0, actual);

    // ---- Persist atomically ----
    // Delete any previous winners for this raffle, then insert the
    // new set. Both operations run in a single transaction so a
    // concurrent request either sees the old winners or the new
    // ones — never a partial state.
    const now = new Date();
    const inserted = await db.transaction(async (tx) => {
      // 1. Clear previous winners (idempotent redraw)
      await tx
        .delete(raffleWinners)
        .where(eq(raffleWinners.raffleId, raffleId));

      // 2. Insert new winners position-ascending.
      //    Position 1 = top prize (first picked after shuffle).
      const rows = picked.map((p, i) => ({
        raffleId,
        position: i + 1,
        customerEmail: p.customerEmail,
        customerName: p.customerName,
        orderId: p.orderId,
      }));

      const insertedRows = await tx
        .insert(raffleWinners)
        .values(rows)
        .returning({
          id: raffleWinners.id,
          position: raffleWinners.position,
          customerEmail: raffleWinners.customerEmail,
          customerName: raffleWinners.customerName,
          orderId: raffleWinners.orderId,
        });

      // 3. Update raffle status
      await tx
        .update(raffles)
        .set({
          status: "drawn",
          drawnAt: now,
          drawnBy: session.userId,
          updatedAt: now,
        })
        .where(eq(raffles.id, raffleId));

      return insertedRows;
    });

    // ---- Sort for the response (belt & suspenders — returning
    //      order from a batch insert isn't guaranteed across DBs,
    //      so we sort explicitly here) ----
    inserted.sort((a, b) => a.position - b.position);

    return NextResponse.json(
      {
        raffle: {
          id: raffle.id,
          name: raffle.name,
          eventId: raffle.eventId,
          winnerCount: raffle.winnerCount,
          status: "drawn",
          drawnAt: now.toISOString(),
          drawnBy: session.userId,
        },
        winners: inserted,
        poolSize,
        requestedWinners: requested,
        actualWinners: actual,
        cappedAtPool,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Unique violation on (raffle_id, position) — this means a
    // concurrent draw raced us and won. Rare, but handled cleanly.
    if (err?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Another draw just completed for this raffle. Refresh to see the results.",
          code: "DRAW_RACE",
        },
        { status: 409 }
      );
    }
    console.error("Draw raffle error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}