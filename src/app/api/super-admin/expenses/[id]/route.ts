import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "artists_crew",
  "production_equipment",
  "event_venue",
  "marketing",
  "operations",
  "admin",
  "travel",
  "catering",
  "other",
] as const;
type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

const VALID_STATUSES = [
  "quote",
  "booked",
  "partial",
  "paid",
  "cancelled",
] as const;
type ExpenseStatus = (typeof VALID_STATUSES)[number];

/* ======================================================
   Compute the correct status from payments.
   Rules:
   - cancelled is a manual state; never auto-overwritten
   - quote stays "quote" until payments arrive OR manually
     moved to "booked"
   - once payments exist: partial (< gross) or paid (>= gross)
   - when no payments: preserves "quote" or "booked" based
     on the current value
   ====================================================== */
function computeStatus(
  current: ExpenseStatus,
  gross: number,
  paid: number
): ExpenseStatus {
  if (current === "cancelled") return "cancelled";

  if (paid <= 0) {
    // No payments — preserve the manual state if it's quote or booked
    if (current === "quote" || current === "booked") return current;
    // If it was paid/partial but payments are gone, fall back to booked
    return "booked";
  }

  if (paid < gross) return "partial";
  return "paid";
}

// ======================================================
// GET /api/super-admin/expenses/[id]
// ======================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const { id } = await params;
    const expenseId = Number(id);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({
        id: expenses.id,
        eventId: expenses.eventId,
        eventTitle: events.title,
        category: expenses.category,
        title: expenses.title,
        description: expenses.description,
        supplier: expenses.supplier,
        subCategory: expenses.subCategory,
        grossAmount: expenses.grossAmount,
        status: expenses.status,
        issueDate: expenses.issueDate,
        dueDate: expenses.dueDate,
        notes: expenses.notes,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
      })
      .from(expenses)
      .leftJoin(events, eq(expenses.eventId, events.id))
      .where(eq(expenses.id, expenseId));

    if (!row) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    // ---- Fetch payments ----
    const payments = await db
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, expenseId))
      .orderBy(expensePayments.paidAt);

    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const balanceAmount = row.grossAmount - paidAmount;

    return NextResponse.json({
      expense: {
        ...row,
        paidAmount,
        balanceAmount,
        payments,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get expense error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PATCH /api/super-admin/expenses/[id]
// Partial update. Status recomputed from payments unless cancelled.
// ======================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const expenseId = Number(id);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const [existing] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    if (!existing) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // ---- Category ----
    if (body.category !== undefined) {
      const category = String(body.category) as ExpenseCategory;
      if (!VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.category = category;
    }

    // ---- Title ----
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

    // ---- Description ----
    if (body.description !== undefined) {
      updates.description = body.description
        ? String(body.description).trim()
        : null;
    }

    // ---- Supplier ----
    if (body.supplier !== undefined) {
      updates.supplier = body.supplier ? String(body.supplier).trim() : null;
    }

    // ---- Sub-category ----
    if (body.subCategory !== undefined) {
      updates.subCategory = body.subCategory
        ? String(body.subCategory).trim()
        : null;
    }

    // ---- Notes ----
    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes).trim() : null;
    }

    // ---- grossAmount ----
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

    // ---- eventId ----
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

    // ---- issueDate ----
    if (body.issueDate !== undefined) {
      if (!body.issueDate) {
        updates.issueDate = null;
      } else {
        const d = new Date(body.issueDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Invalid issue date" },
            { status: 400 }
          );
        }
        updates.issueDate = d;
      }
    }

    // ---- dueDate ----
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
    // Allow manual transitions to: quote, booked, paid, cancelled.
    // "partial" is always computed — ignore attempts to set it directly.
    let manualStatus: ExpenseStatus | undefined;
    if (body.status !== undefined) {
      const status = String(body.status) as ExpenseStatus;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      if (status !== "partial") {
        manualStatus = status;
      }
    }

    // ---- Compute final status ----
    const gross =
      (updates.grossAmount as number) ?? existing.grossAmount;

    const [{ total }] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${expensePayments.amount}), 0)`,
      })
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, expenseId));

    const paid = Number(total ?? 0);

    // Start from the manual status if provided, otherwise existing
    let baseStatus: ExpenseStatus =
      manualStatus ?? existing.status;

    // Special case: if the user manually sets "paid" but there are no
    // payments, we allow it — because sometimes they're recording a bill
    // that was already paid before they started using this system.
    // In that case, we do NOT auto-compute.
    if (baseStatus === "paid" && paid === 0) {
      updates.status = "paid";
    } else if (baseStatus === "cancelled") {
      updates.status = "cancelled";
    } else {
      updates.status = computeStatus(baseStatus, gross, paid);
    }

    const [updated] = await db
      .update(expenses)
      .set(updates)
      .where(eq(expenses.id, expenseId))
      .returning();

    // ---- Fetch payments for the response ----
    const paymentsAfter = await db
      .select({ amount: expensePayments.amount })
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, expenseId));

    const paidAfter = paymentsAfter.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      expense: {
        ...updated,
        paidAmount: paidAfter,
        balanceAmount: updated.grossAmount - paidAfter,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update expense error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// DELETE /api/super-admin/expenses/[id]
// Cascades to payments. Requires ?confirm=delete.
// ======================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);

    const { id } = await params;
    const expenseId = Number(id);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

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
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    if (!existing) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    await db.delete(expenses).where(eq(expenses.id, expenseId));

    console.log(
      `Expense deleted: SUPER_ADMIN ${session.userId} deleted expense ${expenseId} ("${existing.title}", gross ${existing.grossAmount})`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete expense error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}