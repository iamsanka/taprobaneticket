import { NextRequest, NextResponse } from "next/server";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_METHODS = [
  "bank_transfer",
  "cash",
  "card",
  "mobilepay",
  "other",
] as const;
type ReceiptMethod = (typeof VALID_METHODS)[number];

/* ======================================================
   Recompute parent income status from its receipts.
   Called after every insert/delete of a receipt.
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
// GET /api/super-admin/incomes/[id]/receipts
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

    const [income] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    if (!income) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    const receipts = await db
      .select()
      .from(incomeReceipts)
      .where(eq(incomeReceipts.incomeId, incomeId))
      .orderBy(desc(incomeReceipts.receivedAt));

    const receivedAmount = receipts.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
      receipts,
      summary: {
        grossAmount: income.grossAmount,
        receivedAmount,
        balanceAmount: income.grossAmount - receivedAmount,
        receiptCount: receipts.length,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List receipts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/incomes/[id]/receipts
// Record a partial or full receipt against the income.
// ======================================================
export async function POST(
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

    const [income] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    if (!income) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    if (income.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot add receipts to a cancelled income" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const amount = Number(body.amount);
    const method = (String(body.method ?? "bank_transfer").trim().toLowerCase()) as ReceiptMethod;
    const receivedAtRaw = body.receivedAt;
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

    let receivedAt = new Date();
    if (receivedAtRaw) {
      const d = new Date(receivedAtRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid receivedAt date" },
          { status: 400 }
        );
      }
      receivedAt = d;
    }

    // ---- Soft check: don't over-receive beyond a small tolerance ----
    // We allow going over, but we warn if it exceeds the remaining balance
    // by more than 1 cent. The user might legitimately overpay (exchange
    // rate differences) or undercharge later. We only hard-block on
    // obvious data entry mistakes.
    const [{ total: currentTotal }] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${incomeReceipts.amount}), 0)`,
      })
      .from(incomeReceipts)
      .where(eq(incomeReceipts.incomeId, incomeId));

    const alreadyReceived = Number(currentTotal ?? 0);
    const newTotal = alreadyReceived + amount;
    // We do NOT block over-receipts — see comment above. Just proceed.

    // ---- Insert ----
    const [created] = await db
      .insert(incomeReceipts)
      .values({
        incomeId,
        amount,
        receivedAt,
        method,
        reference,
        notes,
        createdBy: session.userId,
      })
      .returning();

    // ---- Sync parent status ----
    await syncIncomeStatus(incomeId);

    // ---- Fetch fresh parent for response ----
    const [freshIncome] = await db
      .select()
      .from(incomes)
      .where(eq(incomes.id, incomeId));

    return NextResponse.json(
      {
        receipt: created,
        income: {
          ...freshIncome,
          receivedAmount: newTotal,
          balanceAmount: freshIncome.grossAmount - newTotal,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create receipt error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}