import { NextRequest, NextResponse } from "next/server";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_METHODS = [
  "bank_transfer",
  "cash",
  "card",
  "mobilepay",
  "other",
] as const;
type PaymentMethod = (typeof VALID_METHODS)[number];

/* ======================================================
   Recompute parent expense status from its payments.
   Mirrors the logic in the single-expense route.
   ====================================================== */
async function syncExpenseStatus(expenseId: number) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) return;

  // Don't clobber a manually-cancelled expense
  if (expense.status === "cancelled") return;

  const [{ total }] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${expensePayments.amount}), 0)`,
    })
    .from(expensePayments)
    .where(eq(expensePayments.expenseId, expenseId));

  const paid = Number(total ?? 0);

  let status: "quote" | "booked" | "partial" | "paid";

  if (paid <= 0) {
    // Preserve manual quote/booked state
    status = expense.status === "quote" ? "quote" : "booked";
  } else if (paid < expense.grossAmount) {
    status = "partial";
  } else {
    status = "paid";
  }

  if (status !== expense.status) {
    await db
      .update(expenses)
      .set({ status, updatedAt: new Date() })
      .where(eq(expenses.id, expenseId));
  }
}

// ======================================================
// GET /api/super-admin/expenses/[id]/payments
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

    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    const payments = await db
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, expenseId))
      .orderBy(desc(expensePayments.paidAt));

    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      payments,
      summary: {
        grossAmount: expense.grossAmount,
        paidAmount,
        balanceAmount: expense.grossAmount - paidAmount,
        paymentCount: payments.length,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/expenses/[id]/payments
// Record a partial or full payment against the expense.
// ======================================================
export async function POST(
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

    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    if (expense.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot add payments to a cancelled expense" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const amount = Number(body.amount);
    const method = String(body.method ?? "bank_transfer")
      .trim()
      .toLowerCase() as PaymentMethod;
    const paidAtRaw = body.paidAt;
    const reference = body.reference ? String(body.reference).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // ---- Validation ----
    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { error: "amount must be a positive integer (cents)" },
        { status: 400 }
      );
    }

    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json(
        { error: `method must be one of: ${VALID_METHODS.join(", ")}` },
        { status: 400 }
      );
    }

    let paidAt = new Date();
    if (paidAtRaw) {
      const d = new Date(paidAtRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid paidAt date" },
          { status: 400 }
        );
      }
      paidAt = d;
    }

    // ---- Insert ----
    const [created] = await db
      .insert(expensePayments)
      .values({
        expenseId,
        amount,
        paidAt,
        method,
        reference,
        notes,
        createdBy: session.userId,
      })
      .returning();

    // ---- Sync parent status ----
    await syncExpenseStatus(expenseId);

    // ---- Fetch fresh parent + new total for response ----
    const [freshExpense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    const [{ total }] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${expensePayments.amount}), 0)`,
      })
      .from(expensePayments)
      .where(eq(expensePayments.expenseId, expenseId));

    const paid = Number(total ?? 0);

    return NextResponse.json(
      {
        payment: created,
        expense: {
          ...freshExpense,
          paidAmount: paid,
          balanceAmount: freshExpense.grossAmount - paid,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create payment error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}