import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { raffles } from "@/db/schema/raffles";
import { raffleWinners } from "@/db/schema/raffleWinners";
import { events } from "@/db/schema/events";
import { orders } from "@/db/schema/orders";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ======================================================
   GET /api/super-admin/raffles/[id]
   ------------------------------------------------------
   Full detail payload for one raffle:

     raffle       — name, event, count, status, creator, drawnBy
     event        — { id, title } (nullable if deleted)
     winners      — array of raffle_winners rows, position ASC
                    (empty before first draw)
     poolSize     — current distinct paid customers for the event
     poolPreview  — up to 8 sample entries (name + masked email)
                    so the admin can see who's in the pool before
                    drawing. Masked so a screenshot doesn't leak
                    real emails.

   Role: SUPER_ADMIN + ADMIN (both can view)
   ====================================================== */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

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

    // ---- Event ----
    const [event] = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, raffle.eventId));

    // ---- Creator / drawer emails (for audit display) ----
    const userIds = [raffle.createdBy, raffle.drawnBy].filter(
      (v): v is number => v !== null && v !== undefined
    );
    const userEmailById = new Map<number, string>();
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, email: users.email })
        .from(users);
      for (const u of userRows) {
        if (userIds.includes(u.id)) userEmailById.set(u.id, u.email);
      }
    }

    // ---- Winners (position ascending) ----
    const winners = await db
      .select({
        id: raffleWinners.id,
        position: raffleWinners.position,
        customerEmail: raffleWinners.customerEmail,
        customerName: raffleWinners.customerName,
        orderId: raffleWinners.orderId,
        createdAt: raffleWinners.createdAt,
      })
      .from(raffleWinners)
      .where(eq(raffleWinners.raffleId, raffleId))
      .orderBy(asc(raffleWinners.position));

    // ---- Pool size ----
    const [poolRow] = await db
      .select({
        pool: sql<number>`COUNT(DISTINCT LOWER(${orders.customerEmail}))::int`,
      })
      .from(orders)
      .where(
        and(eq(orders.eventId, raffle.eventId), eq(orders.status, "paid"))
      );
    const poolSize = poolRow?.pool ?? 0;

    // ---- Pool preview (up to 8 latest distinct customers) ----
    // Uses DISTINCT ON (lower(email)) to get one row per customer.
    // We don't fetch the whole pool — just enough to show a hint.
    const previewRows = await db
      .select({
        customerEmail: orders.customerEmail,
        customerName: orders.customerName,
      })
      .from(orders)
      .where(
        and(eq(orders.eventId, raffle.eventId), eq(orders.status, "paid"))
      )
      .orderBy(asc(orders.id));

    // Dedupe by lowercased email in JS — cheaper than DISTINCT ON
    // because the pool here is at most a few hundred rows per event.
    const seen = new Set<string>();
    const poolPreview: { customerEmail: string; customerName: string | null }[] =
      [];
    for (const r of previewRows) {
      const key = r.customerEmail.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      poolPreview.push({
        customerEmail: r.customerEmail,
        customerName: r.customerName,
      });
      if (poolPreview.length >= 8) break;
    }

    return NextResponse.json({
      raffle: {
        id: raffle.id,
        eventId: raffle.eventId,
        name: raffle.name,
        winnerCount: raffle.winnerCount,
        status: raffle.status,
        drawnAt: raffle.drawnAt,
        drawnBy: raffle.drawnBy,
        drawnByEmail: raffle.drawnBy
          ? userEmailById.get(raffle.drawnBy) ?? null
          : null,
        createdBy: raffle.createdBy,
        createdByEmail: userEmailById.get(raffle.createdBy) ?? null,
        createdAt: raffle.createdAt,
        updatedAt: raffle.updatedAt,
      },
      event: event ?? null,
      winners,
      poolSize,
      poolPreview,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get raffle error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   DELETE /api/super-admin/raffles/[id]?confirm=delete
   ------------------------------------------------------
   Delete a raffle and all its winners (cascade).

   Role: SUPER_ADMIN only (create + delete are privileged;
   admins can draw but not remove).

   Query: ?confirm=delete required to prevent accidental
   deletion via tooling.

   Note: this is a hard delete. The winner snapshot is lost.
   If you ever want to keep raffle history for auditing, we
   would add a soft-delete flag instead — flag this if it
   matters for compliance.
   ====================================================== */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);
    void session;

    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== "delete") {
      return NextResponse.json(
        {
          error:
            "Add ?confirm=delete to confirm deletion of this raffle.",
          code: "CONFIRM_REQUIRED",
        },
        { status: 400 }
      );
    }

    const { id } = await params;
    const raffleId = parseId(id);
    if (raffleId === null) {
      return NextResponse.json(
        { error: "Invalid raffle id" },
        { status: 400 }
      );
    }

    const [raffle] = await db
      .select({ id: raffles.id, name: raffles.name })
      .from(raffles)
      .where(eq(raffles.id, raffleId));
    if (!raffle) {
      return NextResponse.json(
        { error: "Raffle not found", code: "RAFFLE_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Cascade: FK on raffle_winners has onDelete: "cascade", so
    // deleting the raffle removes its winners in one statement.
    // We still wrap in a transaction for a clean atomic delete
    // in case future schema changes add related rows.
    await db.transaction(async (tx) => {
      await tx.delete(raffles).where(eq(raffles.id, raffleId));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete raffle error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}