import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";
import { getSettings } from "@/lib/settings/getSettings";

export const runtime = "nodejs";

function derivePaymentMethod(
  sentinel: string
): "card" | "epassi" | "edenred" {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const settings = await getSettings();
    const vatDecimal = settings.vatRateDecimal;

    // ---- Parse filters ----
    const params = req.nextUrl.searchParams;
    const eventIdRaw = params.get("eventId");
    const statusRaw = params.get("status");
    const methodRaw = params.get("method");
    const dateFromRaw = params.get("dateFrom");
    const dateToRaw = params.get("dateTo");

    const eventIdFilter =
      eventIdRaw && eventIdRaw !== "all" ? Number(eventIdRaw) : null;
    const statusFilter =
      statusRaw && statusRaw !== "all" ? statusRaw : null;
    const methodFilter =
      methodRaw && methodRaw !== "all" ? methodRaw : null;

    const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
    const dateTo = dateToRaw ? new Date(dateToRaw) : null;
    // Make dateTo inclusive of the whole day
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }

    // ---- Build the WHERE clause ----
    const conditions = [];
    if (eventIdFilter !== null) {
      conditions.push(eq(orders.eventId, eventIdFilter));
    }
    if (statusFilter) {
      conditions.push(eq(orders.status, statusFilter));
    }
    if (dateFrom) {
      conditions.push(gte(orders.createdAt, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(orders.createdAt, dateTo));
    }

    // ---- Fetch all matching orders ----
    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        eventId: orders.eventId,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        totalPrice: orders.totalPrice,
        // ⭐ NEW — discount snapshot on the order
        discountCode: orders.discountCode,
        discountAmount: orders.discountAmount,
        status: orders.status,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        eventTitle: events.title,
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.id));

    // ---- Filter by payment method (done in JS since it's a string prefix) ----
    const filteredOrders = methodFilter
      ? orderRows.filter(
          (o) => derivePaymentMethod(o.stripePaymentIntentId) === methodFilter
        )
      : orderRows;

    // ---- Ticket counts per order ----
    const orderIds = filteredOrders.map((o) => o.id);
    const ticketCounts = new Map<number, { total: number; scanned: number }>();

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
        const existing = ticketCounts.get(t.orderId) ?? {
          total: 0,
          scanned: 0,
        };
        existing.total += 1;
        if (t.isScanned) existing.scanned += 1;
        ticketCounts.set(t.orderId, existing);
      }
    }

    // ---- Build the enriched order list ----
    const enrichedOrders = filteredOrders.map((o) => {
      const counts = ticketCounts.get(o.id) ?? { total: 0, scanned: 0 };
      // ⭐ discountAmount is nullable in DB; normalize to 0 for the UI
      const discountAmount = o.discountAmount ?? 0;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        eventId: o.eventId,
        eventTitle: o.eventTitle,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        customerPhone: o.customerPhone,
        totalPrice: o.totalPrice,
        // ⭐ NEW
        discountCode: o.discountCode ?? null,
        discountAmount,
        status: o.status,
        method: derivePaymentMethod(o.stripePaymentIntentId),
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        ticketCount: counts.total,
        scannedCount: counts.scanned,
      };
    });

    // ---- KPIs (from all filtered orders, but revenue only counts paid) ----
    const paidOrders = enrichedOrders.filter((o) => o.status === "paid");

    // totalPrice is POST-discount (what the customer actually paid).
    // To get gross revenue (pre-discount), we add back the discount.
    const totalRevenue = paidOrders.reduce((s, o) => s + o.totalPrice, 0);
    const totalDiscount = paidOrders.reduce(
      (s, o) => s + o.discountAmount,
      0
    );
    const grossRevenue = totalRevenue + totalDiscount;
    const discountOrderCount = paidOrders.filter(
      (o) => o.discountAmount > 0
    ).length;
    // % of gross given away
    const discountPercent =
      grossRevenue > 0 ? (totalDiscount / grossRevenue) * 100 : 0;

    const totalTickets = paidOrders.reduce((s, o) => s + o.ticketCount, 0);
    const totalScanned = paidOrders.reduce((s, o) => s + o.scannedCount, 0);

    const vatAmount = Math.round(totalRevenue * vatDecimal);
    const netAmount = totalRevenue - vatAmount;

    const cardRevenue = paidOrders
      .filter((o) => o.method === "card")
      .reduce((s, o) => s + o.totalPrice, 0);
    const epassiRevenue = paidOrders
      .filter((o) => o.method === "epassi")
      .reduce((s, o) => s + o.totalPrice, 0);
    const edenredRevenue = paidOrders
      .filter((o) => o.method === "edenred")
      .reduce((s, o) => s + o.totalPrice, 0);

    const statusCounts: Record<string, number> = {
      paid: 0,
      pending: 0,
      pending_benefit: 0,
      cancelled: 0,
      refunded: 0,
    };
    for (const o of enrichedOrders) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    }

    const avgOrderValue =
      paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0;

    const kpi = {
      totalRevenue,
      // ⭐ NEW — discount aggregates
      totalDiscount,
      grossRevenue,
      discountOrderCount,
      discountPercent,
      netAmount,
      vatAmount,
      vatRatePercent: settings.vatRatePercent,
      paidOrderCount: paidOrders.length,
      totalTickets,
      totalScanned,
      scannedPercent: totalTickets > 0 ? (totalScanned / totalTickets) * 100 : 0,
      avgOrderValue,
      cardRevenue,
      epassiRevenue,
      edenredRevenue,
      statusCounts,
    };

    // ---- Per-event breakdown ----
    const perEventMap = new Map<
      number,
      {
        eventId: number;
        eventTitle: string;
        orderCount: number;
        ticketCount: number;
        scannedCount: number;
        revenue: number;
        // ⭐ NEW
        discountTotal: number;
      }
    >();

    for (const o of paidOrders) {
      const existing = perEventMap.get(o.eventId) ?? {
        eventId: o.eventId,
        eventTitle: o.eventTitle ?? "—",
        orderCount: 0,
        ticketCount: 0,
        scannedCount: 0,
        revenue: 0,
        discountTotal: 0,
      };
      existing.orderCount += 1;
      existing.ticketCount += o.ticketCount;
      existing.scannedCount += o.scannedCount;
      existing.revenue += o.totalPrice;
      existing.discountTotal += o.discountAmount; // ⭐
      perEventMap.set(o.eventId, existing);
    }

    const perEvent = Array.from(perEventMap.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    // ---- All events for filter dropdown ----
    const allEvents = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .orderBy(desc(events.id));

    return NextResponse.json({
      kpi,
      perEvent,
      orders: enrichedOrders,
      availableEvents: allEvents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Reports error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}