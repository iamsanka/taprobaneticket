import { NextRequest, NextResponse } from "next/server";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { events } from "@/db/schema/events";
import { incomes } from "@/db/schema/incomes";
import { incomeReceipts } from "@/db/schema/incomeReceipts";
import { expenses } from "@/db/schema/expenses";
import { expensePayments } from "@/db/schema/expensePayments";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { paymentMethodCosts } from "@/db/schema/paymentMethodCosts";
import { discountCodes } from "@/db/schema/discountCodes";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

type Method = "card" | "epassi" | "edenred";

function calcFee(
  amount: number,
  mode: "percentage_plus_fixed" | "percentage_or_fixed",
  percentageBps: number,
  fixedAmount: number
): number {
  const pctFee = Math.round((amount * percentageBps) / 10000);
  if (mode === "percentage_plus_fixed") return pctFee + fixedAmount;
  return Math.max(pctFee, fixedAmount);
}

function deriveMethod(sentinel: string): Method {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    }

    // ==================================================
    // 1. Event basics
    // ==================================================
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ==================================================
    // 2. Ticket sales for this event
    // ==================================================
    const eventOrders = await db
      .select({
        id: orders.id,
        totalPrice: orders.totalPrice,
        status: orders.status,
        sentinel: orders.stripePaymentIntentId,
        paidAt: orders.paidAt,
        // ⭐ NEW — discount snapshot for aggregation
        discountCode: orders.discountCode,
        discountAmount: orders.discountAmount,
      })
      .from(orders)
      .where(eq(orders.eventId, eventId))
      .orderBy(desc(orders.id));

    // Ticket count per order (to build the "tickets sold" summary)
    const orderIds = eventOrders.map((o) => o.id);
    const ticketCountMap = new Map<number, { total: number; scanned: number }>();

    if (orderIds.length > 0) {
      const ticketRows = await db
        .select({
          orderId: orderTickets.orderId,
          isScanned: orderTickets.isScanned,
        })
        .from(orderTickets)
        .where(
          sql`${orderTickets.orderId} IN (${sql.join(
            orderIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      for (const t of ticketRows) {
        const ex = ticketCountMap.get(t.orderId) ?? { total: 0, scanned: 0 };
        ex.total += 1;
        if (t.isScanned) ex.scanned += 1;
        ticketCountMap.set(t.orderId, ex);
      }
    }

    const paidOrders = eventOrders.filter((o) => o.status === "paid");

    // ---- Ticket revenue by method + fees ----
    const methodTotals: Record<
      Method,
      { orderCount: number; grossRevenue: number; fees: number; netRevenue: number }
    > = {
      card: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
      epassi: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
      edenred: { orderCount: 0, grossRevenue: 0, fees: 0, netRevenue: 0 },
    };

    const costRows = await db
      .select()
      .from(paymentMethodCosts)
      .where(eq(paymentMethodCosts.isActive, true));

    const costMap = new Map<Method, typeof costRows[number]>();
    for (const c of costRows) costMap.set(c.method as Method, c);

    let ticketGross = 0;
    let ticketFees = 0;
    let ticketCount = 0;
    let scannedCount = 0;

    for (const o of paidOrders) {
      const method = deriveMethod(o.sentinel);
      methodTotals[method].orderCount += 1;
      methodTotals[method].grossRevenue += o.totalPrice;

      const config = costMap.get(method);
      let fee = 0;
      if (config) {
        fee = calcFee(
          o.totalPrice,
          config.mode as "percentage_plus_fixed" | "percentage_or_fixed",
          config.percentageBps,
          config.fixedAmount
        );
      }
      methodTotals[method].fees += fee;

      ticketGross += o.totalPrice;
      ticketFees += fee;

      const counts = ticketCountMap.get(o.id) ?? { total: 0, scanned: 0 };
      ticketCount += counts.total;
      scannedCount += counts.scanned;
    }

    for (const m of Object.keys(methodTotals) as Method[]) {
      methodTotals[m].netRevenue =
        methodTotals[m].grossRevenue - methodTotals[m].fees;
    }

    const ticketNet = ticketGross - ticketFees;

    // ==================================================
    // ⭐ 2b. Discounts applied to this event
    // ==================================================
    // Aggregate from paid orders only (discounts on cancelled orders
    // were never actually granted).
    let discountsTotal = 0;
    let discountsOrderCount = 0;
    const discountByCode = new Map<
      string,
      { code: string; uses: number; total: number }
    >();

    for (const o of paidOrders) {
      const amt = o.discountAmount ?? 0;
      if (amt <= 0 || !o.discountCode) continue;

      discountsTotal += amt;
      discountsOrderCount += 1;

      const existing = discountByCode.get(o.discountCode) ?? {
        code: o.discountCode,
        uses: 0,
        total: 0,
      };
      existing.uses += 1;
      existing.total += amt;
      discountByCode.set(o.discountCode, existing);
    }

    // Enrich with each code's percentage (immutable after creation)
    const discountCodesInUse = Array.from(discountByCode.keys());
    let percentagesByCode = new Map<string, number>();

    if (discountCodesInUse.length > 0) {
      const codeRows = await db
        .select({
          code: discountCodes.code,
          percentage: discountCodes.percentage,
        })
        .from(discountCodes)
        .where(inArray(discountCodes.code, discountCodesInUse));

      for (const r of codeRows) {
        percentagesByCode.set(r.code, r.percentage);
      }
    }

    const discountPerCode = Array.from(discountByCode.values())
      .map((d) => ({
        code: d.code,
        percentage: percentagesByCode.get(d.code) ?? null,
        uses: d.uses,
        total: d.total,
      }))
      .sort((a, b) => b.total - a.total);

    // Pre-discount ticket gross (what would have been charged without codes)
    const ticketGrossBeforeDiscount = ticketGross + discountsTotal;

    // ==================================================
    // 3. Event-specific incomes
    // ==================================================
    const eventIncomes = await db
      .select()
      .from(incomes)
      .where(eq(incomes.eventId, eventId))
      .orderBy(desc(incomes.id));

    const eventIncomeIds = eventIncomes.map((i) => i.id);
    const receivedByIncome = new Map<number, number>();

    if (eventIncomeIds.length > 0) {
      const receiptRows = await db
        .select({
          incomeId: incomeReceipts.incomeId,
          amount: incomeReceipts.amount,
        })
        .from(incomeReceipts)
        .where(
          sql`${incomeReceipts.incomeId} IN (${sql.join(
            eventIncomeIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      for (const r of receiptRows) {
        receivedByIncome.set(
          r.incomeId,
          (receivedByIncome.get(r.incomeId) ?? 0) + r.amount
        );
      }
    }

    const enrichedIncomes = eventIncomes.map((i) => {
      const received = receivedByIncome.get(i.id) ?? 0;
      return {
        ...i,
        receivedAmount: received,
        balanceAmount: i.grossAmount - received,
      };
    });

    const activeIncomes = enrichedIncomes.filter(
      (i) => i.status !== "cancelled"
    );
    const incomeGross = activeIncomes.reduce((s, i) => s + i.grossAmount, 0);
    const incomeReceived = activeIncomes.reduce(
      (s, i) => s + i.receivedAmount,
      0
    );
    const incomeOutstanding = incomeGross - incomeReceived;

    // ==================================================
    // 4. Event-specific expenses
    // ==================================================
    const eventExpenses = await db
      .select()
      .from(expenses)
      .where(eq(expenses.eventId, eventId))
      .orderBy(desc(expenses.id));

    const eventExpenseIds = eventExpenses.map((e) => e.id);
    const paidByExpense = new Map<number, number>();

    if (eventExpenseIds.length > 0) {
      const paymentRows = await db
        .select({
          expenseId: expensePayments.expenseId,
          amount: expensePayments.amount,
        })
        .from(expensePayments)
        .where(
          sql`${expensePayments.expenseId} IN (${sql.join(
            eventExpenseIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      for (const p of paymentRows) {
        paidByExpense.set(
          p.expenseId,
          (paidByExpense.get(p.expenseId) ?? 0) + p.amount
        );
      }
    }

    const enrichedExpenses = eventExpenses.map((e) => {
      const paid = paidByExpense.get(e.id) ?? 0;
      return {
        ...e,
        paidAmount: paid,
        balanceAmount: e.grossAmount - paid,
      };
    });

    const activeExpenses = enrichedExpenses.filter(
      (e) => e.status !== "cancelled"
    );
    const expenseGross = activeExpenses.reduce((s, e) => s + e.grossAmount, 0);
    const expensePaid = activeExpenses.reduce((s, e) => s + e.paidAmount, 0);
    const expenseOutstanding = expenseGross - expensePaid;

    // ==================================================
    // 5. Money-in / money-out for this event
    // ==================================================
    const totalRevenueIn = ticketNet + incomeReceived;
    const totalExpensesPaid = expensePaid;
    const netPosition = totalRevenueIn - totalExpensesPaid;
    const remainingCommitments = expenseOutstanding;
    const fundingRequired = Math.max(
      remainingCommitments - totalRevenueIn,
      0
    );

    // ==================================================
    // 6. Response
    // ==================================================
    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        eventTime: event.eventTime,
        location: event.location,
        visibility: event.visibility,
      },
      kpi: {
        ticketSalesGross: ticketGross,
        ticketSalesNet: ticketNet,
        ticketFees,
        ticketCount,
        scannedCount,
        incomeGross,
        incomeReceived,
        incomeOutstanding,
        expenseGross,
        expensePaid,
        expenseOutstanding,
        totalRevenueIn,
        totalExpensesPaid,
        netPosition,
        remainingCommitments,
        fundingRequired,
        // ⭐ NEW — discount aggregates
        ticketGrossBeforeDiscount,
        discountsTotal,
        discountsOrderCount,
      },
      // ⭐ NEW — per-code breakdown
      discounts: {
        total: discountsTotal,
        orderCount: discountsOrderCount,
        grossBeforeDiscount: ticketGrossBeforeDiscount,
        perCode: discountPerCode,
      },
      byMethod: {
        card: methodTotals.card,
        epassi: methodTotals.epassi,
        edenred: methodTotals.edenred,
      },
      incomes: enrichedIncomes,
      expenses: enrichedExpenses,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Event finance error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}