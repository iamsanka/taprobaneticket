import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

/* ======================================================
   Recompute parent income status from its receipts.
   Same logic as the receipts POST — kept inline here to
   avoid a cross-folder import.
   ====================================================== */
async function syncIncomeStatus(incomeId: number) {
  const [income] = await db
    .select()
    .from(incomes)
    .where(eq(incomes.id, incomeId));

  if (!income) return;

  // Don't clobber a manually-cancelled income
  if (income.status === "cancelled") return;

  const [{ total }] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${incomeReceipts.amount}), 0)`,
    })
    .from(incomeReceipts)
    .where(eq(incomeReceipts.incomeId, incomeId));

  const received = Number(total ?? 0);

  let status: "expected" | "partial" | "received";
  if (received <= 0) status = "expected";
  else if (received < income.grossAmount) status = "partial";
  else status = "received";

  if (status !== income.status) {
    await db
      .update(incomes)
      .set({ status, updatedAt: new Date() })
      .where(eq(incomes.id, incomeId));
  }
}

// ======================================================
// DELETE /api/super-admin/incomes/[id]/receipts/[receiptId]
// Removes a receipt and re-syncs the parent income status.
// ======================================================
export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; receiptId: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id, receiptId } = await params;
    const incomeId = Number(id);
    const rId = Number(receiptId);

    if (!Number.isInteger(incomeId) || incomeId <= 0) {
      return NextResponse.json({ error: "Invalid income id" }, { status: 400 });
    }

    if (!Number.isInteger(rId) || rId <= 0) {
      return NextResponse.json(
        { error: "Invalid receipt id" },
        { status: 400 }
      );
    }

    // ---- Fetch the receipt and confirm it belongs to the income ----
    const [existing] = await db
      .select()
      .from(incomeReceipts)
      .where(
        and(
          eq(incomeReceipts.id, rId),
          eq(incomeReceipts.incomeId, incomeId)
        )
      );

    if (!existing) {
      return NextResponse.json(
        { error: "Receipt not found for this income" },
        { status: 404 }
      );
    }

    // ---- Delete it ----
    await db.delete(incomeReceipts).where(eq(incomeReceipts.id, rId));

    // ---- Sync parent ----
    await syncIncomeStatus(incomeId);

    // ---- Fetch fresh parent for response ----
    const [freshIncome] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    const [{ total: newTotal }] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${incomeReceipts.amount}), 0)`,
      })
      .from(incomeReceipts)
      .where(eq(incomeReceipts.incomeId, incomeId));

    const received = Number(newTotal ?? 0);

    console.log(
      `Receipt deleted: user ${session.userId} removed receipt ${rId} from income ${incomeId} (amount ${existing.amount})`
    );

    return NextResponse.json({
      success: true,
      income: {
        ...freshIncome,
        receivedAmount: received,
        balanceAmount: freshIncome.grossAmount - received,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete receipt error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}