import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "director_share",
  "sponsorship",
  "donation",
  "bank_transfer",
  "other",
] as const;
type IncomeCategory = (typeof VALID_CATEGORIES)[number];

const VALID_STATUSES = [
  "expected",
  "partial",
  "received",
  "cancelled",
] as const;
type IncomeStatus = (typeof VALID_STATUSES)[number];

// ======================================================
// GET /api/super-admin/incomes/[id]
// ======================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const { id } = await params;
    const incomeId = Number(id);

    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return NextResponse.json({ error: "Invalid income id" }, { status: 400 });
    }

    const [row] = await db
      .select({
        id: incomes.id,
        eventId: incomes.eventId,
        eventTitle: events.title,
        category: incomes.category,
        title: incomes.title,
        description: incomes.description,
        payer: incomes.payer,
        grossAmount: incomes.grossAmount,
        status: incomes.status,
        dueDate: incomes.dueDate,
        notes: incomes.notes,
        createdAt: incomes.createdAt,
        updatedAt: incomes.updatedAt,
      })
      .from(incomes)
      .leftJoin(events, eq(incomes.eventId, events.id))
      .where(eq(incomes.id, incomeId));

    if (!row) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    // ---- Fetch receipts ----
    const receipts = await db
      .select()
      .from(incomeReceipts)
      .where(eq(incomeReceipts.incomeId, incomeId))
      .orderBy(incomeReceipts.receivedAt);

    const receivedAmount = receipts.reduce((s, r) => s + r.amount, 0);
    const balanceAmount = row.grossAmount - receivedAmount;

    return NextResponse.json({
      income: {
        ...row,
        receivedAmount,
        balanceAmount,
        receipts,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get income error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PATCH /api/super-admin/incomes/[id]
// Update fields. Auto-syncs status from receipts if status not given.
// ======================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const incomeId = Number(id);

    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return NextResponse.json({ error: "Invalid income id" }, { status: 400 });
    }

    const body = await req.json();

    const [existing] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    if (!existing) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    // ---- Build updates object ----
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.category !== undefined) {
      const category = String(body.category) as IncomeCategory;
      if (!VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.category = category;
    }

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 255) {
        return NextResponse.json(
          { error: "Title is required (1–255 characters)" },
          { status: 400 }
        );
      }
      updates.title = title;
    }

    if (body.description !== undefined) {
      updates.description = body.description
        ? String(body.description).trim()
        : null;
    }

    if (body.payer !== undefined) {
      updates.payer = body.payer ? String(body.payer).trim() : null;
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes).trim() : null;
    }

    if (body.grossAmount !== undefined) {
      const grossAmount = Number(body.grossAmount);
      if (
        !Number.isFinite(grossAmount) ||
        !Number.isInteger(grossAmount) ||
        grossAmount <= 0
      ) {
        return NextResponse.json(
          { error: "grossAmount must be a positive integer (cents)" },
          { status: 400 }
        );
      }
      updates.grossAmount = grossAmount;
    }

    if (body.eventId !== undefined) {
      if (body.eventId === null || body.eventId === "") {
        updates.eventId = null;
      } else {
        const eventId = Number(body.eventId);
        if (!Number.isInteger(eventId) || eventId <= 0) {
          return NextResponse.json(
            { error: "eventId must be a valid number or null" },
            { status: 400 }
          );
        }
        updates.eventId = eventId;
      }
    }

    if (body.dueDate !== undefined) {
      if (!body.dueDate) {
        updates.dueDate = null;
      } else {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Invalid due date" },
            { status: 400 }
          );
        }
        updates.dueDate = d;
      }
    }

    // ---- Status handling ----
    // If the caller explicitly passes a status, we honor it — BUT a
    // "cancelled" status is the only one we allow manually overriding.
    // Otherwise we compute from receipts to keep the data consistent.
    if (body.status !== undefined) {
      const status = String(body.status) as IncomeStatus;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      // Allow manual "cancelled" and manual "expected" (to un-cancel)
      if (status === "cancelled" || status === "expected") {
        updates.status = status;
      }
      // "partial" and "received" are computed — ignore if the caller tries
      // to set them manually; we'll compute below.
    }

    // ---- Compute status from receipts (unless cancelled) ----
    const currentStatus =
      (updates.status as IncomeStatus | undefined) ?? existing.status;

    if (currentStatus !== "cancelled") {
      const gross = (updates.grossAmount as number) ?? existing.grossAmount;

      const [{ total }] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${incomeReceipts.amount}), 0)`,
        })
        .from(incomeReceipts)
        .where(eq(incomeReceipts.incomeId, incomeId));

      const received = Number(total ?? 0);

      let computed: IncomeStatus;
      if (received <= 0) computed = "expected";
      else if (received < gross) computed = "partial";
      else computed = "received";

      // Preserve explicit "expected" if caller un-cancelled but there are
      // receipts — actually no, that would be wrong. The computed value is
      // the truth. But if caller explicitly sent "expected" AND there are
      // no receipts, computed is also "expected" — consistent.
      updates.status = computed;
    }

    const [updated] = await db
      .update(incomes)
      .set(updates)
      .where(eq(incomes.id, incomeId))
      .returning();

    // ---- Attach computed totals for the response ----
    const receiptsAfter = await db
      .select({ amount: incomeReceipts.amount })
      .from(incomeReceipts)
      .where(eq(incomeReceipts.incomeId, incomeId));

    const receivedAfter = receiptsAfter.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
      income: {
        ...updated,
        receivedAmount: receivedAfter,
        balanceAmount: updated.grossAmount - receivedAfter,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update income error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// DELETE /api/super-admin/incomes/[id]
// Cascades to receipts. Requires explicit confirmation query param.
// ======================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);

    const { id } = await params;
    const incomeId = Number(id);

    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return NextResponse.json({ error: "Invalid income id" }, { status: 400 });
    }

    // Extra safety: require ?confirm=delete to prevent accidents
    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== "delete") {
      return NextResponse.json(
        {
          error:
            "Deletion requires ?confirm=delete query parameter to confirm.",
        },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    if (!existing) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    // Cascade delete (DB constraint set to cascade)
    await db.delete(incomes).where(eq(incomes.id, incomeId));

    console.log(
      `Income deleted: SUPER_ADMIN ${session.userId} deleted income ${incomeId} ("${existing.title}")`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete income error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}