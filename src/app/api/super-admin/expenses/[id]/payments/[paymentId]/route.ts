import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

/* ======================================================
   Recompute parent expense status from its payments.
   Same logic as the payments POST endpoint.
   ====================================================== */
async function syncExpenseStatus(expenseId: number) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) return;

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
// DELETE /api/super-admin/expenses/[id]/payments/[paymentId]
// Removes a payment and re-syncs the parent expense status.
// ======================================================
export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id, paymentId } = await params;
    const expenseId = Number(id);
    const pId = Number(paymentId);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return NextResponse.json(
        { error: "Invalid expense id" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(pId) || pId <= 0) {
      return NextResponse.json(
        { error: "Invalid payment id" },
        { status: 400 }
      );
    }

    // ---- Fetch the payment and confirm it belongs to the expense ----
    const [existing] = await db
      .select()
      .from(expensePayments)
      .where(
        and(
          eq(expensePayments.id, pId),
          eq(expensePayments.expenseId, expenseId)
        )
      );

    if (!existing) {
      return NextResponse.json(
        { error: "Payment not found for this expense" },
        { status: 404 }
      );
    }

    // ---- Delete it ----
    await db.delete(expensePayments).where(eq(expensePayments.id, pId));

    // ---- Sync parent ----
    await syncExpenseStatus(expenseId);

    // ---- Fetch fresh parent + new total ----
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

    console.log(
      `Payment deleted: user ${session.userId} removed payment ${pId} from expense ${expenseId} (amount ${existing.amount})`
    );

    return NextResponse.json({
      success: true,
      expense: {
        ...freshExpense,
        paidAmount: paid,
        balanceAmount: freshExpense.grossAmount - paid,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete payment error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}