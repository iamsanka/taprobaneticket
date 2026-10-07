import { NextRequest, NextResponse } from "next/server";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { orders } from "@/db/schema/orders";
import { paymentMethodCosts } from "@/db/schema/paymentMethodCosts";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

type Method = "card" | "epassi" | "edenred";

/* ======================================================
   Calculate the fee for one order based on the method's cost config.
   Formulas:
     percentage_plus_fixed → round(amount * bps / 10000) + fixed
     percentage_or_fixed   → max(round(amount * bps / 10000), fixed)
   ====================================================== */
function calcFee(
  amount: number,
  mode: "percentage_plus_fixed" | "percentage_or_fixed",
  percentageBps: number,
  fixedAmount: number
): number {
  const pctFee = Math.round((amount * percentageBps) / 10000);
  if (mode === "percentage_plus_fixed") {
    return pctFee + fixedAmount;
  }
  return Math.max(pctFee, fixedAmount);
}

function deriveMethod(sentinel: string): Method {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT", "STAFF"]);

    // ==================================================
    // 1. Income aggregates
    // ==================================================
    const [incomeGrossRow] = await db
      .select({
        totalGross: sql<number>`COALESCE(SUM(CASE WHEN ${incomes.status} != 'cancelled' THEN ${incomes.grossAmount} ELSE 0 END), 0)`,
      })
      .from(incomes);

    const [incomeReceivedRow] = await db
      .select({
        totalReceived: sql<number>`COALESCE(SUM(${incomeReceipts.amount}), 0)`,
      })
      .from(incomeReceipts)
      .innerJoin(incomes, eq(incomeReceipts.incomeId, incomes.id))
      .where(sql`${incomes.status} != 'cancelled'`);

    const incomeGross = Number(incomeGrossRow?.totalGross ?? 0);
    const incomeReceived = Number(incomeReceivedRow?.totalReceived ?? 0);
    const incomeOutstanding = Math.max(incomeGross - incomeReceived, 0);

    // ==================================================
    // 2. Expense aggregates
    // ==================================================
    const [expenseGrossRow] = await db
      .select({
        totalGross: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.status} != 'cancelled' THEN ${expenses.grossAmount} ELSE 0 END), 0)`,
      })
      .from(expenses);

    const [expensePaidRow] = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${expensePayments.amount}), 0)`,
      })
      .from(expensePayments)
      .innerJoin(expenses, eq(expensePayments.expenseId, expenses.id))
      .where(sql`${expenses.status} != 'cancelled'`);

    const expenseGross = Number(expenseGrossRow?.totalGross ?? 0);
    const expensePaid = Number(expensePaidRow?.totalPaid ?? 0);
    const expenseOutstanding = Math.max(expenseGross - expensePaid, 0);

    // ==================================================
    // 3. Ticket revenue (paid orders only) + payment method split
    // ==================================================
    const paidOrders = await db
      .select({
        totalPrice: orders.totalPrice,
        sentinel: orders.stripePaymentIntentId,
      })
      .from(orders)
      .where(eq(orders.status, "paid"));

    const methodTotals: Record<
      Method,
      { orderCount: number; grossRevenue: number; fees: number; netRevenue: number }
    > = {
      card: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
      epassi: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
      edenred: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
    };

    // ---- Load payment method costs ----
    const costRows = await db
      .select()
      .from(paymentMethodCosts)
      .where(eq(paymentMethodCosts.isActive, true));

    const costMap = new Map<Method, typeof costRows[number]>();
    for (const c of costRows) {
      costMap.set(c.method as Method, c);
    }

    // ---- Apply fees per order ----
    let ticketGross = 0;
    let ticketFees = 0;

    for (const o of paidOrders) {
      const method = deriveMethod(o.sentinel);
      const amount = o.totalPrice;

      methodTotals[method].orderCount += 1;
      methodTotals[method].grossRevenue += amount;

      const config = costMap.get(method);
      let fee = 0;
      if (config) {
        fee = calcFee(
          amount,
          config.mode as "percentage_plus_fixed" | "percentage_or_fixed",
          config.percentageBps,
          config.fixedAmount
        );
      }
      methodTotals[method].fees += fee;

      ticketGross += amount;
      ticketFees += fee;
    }

    for (const m of Object.keys(methodTotals) as Method[]) {
      methodTotals[m].netRevenue =
        methodTotals[m].grossRevenue - methodTotals[m].fees;
    }

    const ticketNet = ticketGross - ticketFees;

    // ==================================================
    // 4. Bank balance = received income + net ticket revenue - paid expenses
    // ==================================================
    // We treat ticket revenue as received income (it's money in the bank
    // net of Stripe/benefit fees), separate from the "incomes" table so
    // double-counting is avoided.
    const bankBalance =
      incomeReceived + ticketNet - expensePaid;

    // ==================================================
    // 5. Remaining commitments
    // ==================================================
    // Money we owe (unpaid expenses) vs money still expected (income outstanding).
    // Commitments = unpaid expenses (we must pay them).
    // The income outstanding is a future inflow, not a commitment.
    const remainingCommitments = expenseOutstanding;

    // Funding required = what we still owe minus what we have
    const fundingRequired = Math.max(
      remainingCommitments - bankBalance,
      0
    );

    // ==================================================
    // 6. Response
    // ==================================================
    return NextResponse.json({
      bankBalance: {
        // Money actually in the bank right now
        value: bankBalance,
        incomeReceived,
        ticketNetRevenue: ticketNet,
        expensesPaid: expensePaid,
      },
      remainingCommitments: {
        value: remainingCommitments,
        totalExpenses: expenseGross,
        totalPaid: expensePaid,
        outstanding: expenseOutstanding,
      },
      fundingRequired: {
        value: fundingRequired,
        reason:
          fundingRequired > 0
            ? "Expenses outstanding exceed available cash"
            : "Sufficient cash to cover outstanding expenses",
      },
      income: {
        gross: incomeGross,
        received: incomeReceived,
        outstanding: incomeOutstanding,
      },
      expenses: {
        gross: expenseGross,
        paid: expensePaid,
        outstanding: expenseOutstanding,
      },
      tickets: {
        grossRevenue: ticketGross,
        fees: ticketFees,
        netRevenue: ticketNet,
        orderCount: paidOrders.length,
      },
      byMethod: {
        card: methodTotals.card,
        epassi: methodTotals.epassi,
        edenred: methodTotals.edenred,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Finance summary error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}