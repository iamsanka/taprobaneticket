import { NextRequest, NextResponse } from "next/server";
import { sql, eq, desc, and } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VAT_RATE_OF_GROSS = 0.135;

export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    // Run everything in parallel for a snappy dashboard
    const [
      totalsRow,
      ticketsRow,
      scannedRow,
      pendingRow,
      recentOrders,
      eventSummary,
    ] = await Promise.all([
      // ---- 1. Total revenue (paid orders only) ----
      db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${orders.totalPrice}), 0)`,
          paidOrderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(eq(orders.status, "paid")),

      // ---- 2. Tickets sold (from paid orders) ----
      db
        .select({
          ticketCount: sql<number>`COUNT(${orderTickets.id})`,
        })
        .from(orderTickets)
        .innerJoin(orders, eq(orderTickets.orderId, orders.id))
        .where(eq(orders.status, "paid")),

      // ---- 3. Tickets scanned ----
      db
        .select({
          scannedCount: sql<number>`COUNT(${orderTickets.id})`,
        })
        .from(orderTickets)
        .innerJoin(orders, eq(orderTickets.orderId, orders.id))
        .where(
          and(eq(orders.status, "paid"), eq(orderTickets.isScanned, true))
        ),

      // ---- 4. Pending benefit orders count ----
      db
        .select({
          pendingCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(eq(orders.status, "pending_benefit")),

      // ---- 5. Recent 10 orders ----
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          totalPrice: orders.totalPrice,
          status: orders.status,
          stripePaymentIntentId: orders.stripePaymentIntentId,
          eventTitle: events.title,
        })
        .from(orders)
        .leftJoin(events, eq(orders.eventId, events.id))
        .orderBy(desc(orders.id))
        .limit(10),

      // ---- 6. Per-event summary ----
      db
        .select({
          eventId: events.id,
          eventTitle: events.title,
          eventTime: events.eventTime,
          visibility: events.visibility,
          ticketCount: sql<number>`COUNT(${orderTickets.id})`,
          revenue: sql<number>`COALESCE(SUM(${orderTickets.id} * 0 + 
            (SELECT total_price / NULLIF(ticket_count, 0) 
             FROM (SELECT SUM(total_price) AS total_price, COUNT(*) AS ticket_count 
                   FROM order_tickets ot2 
                   INNER JOIN orders o2 ON o2.id = ot2.order_id 
                   WHERE ot2.event_id = ${events.id} AND o2.status = 'paid') sub)), 0)`,
          scannedCount: sql<number>`COUNT(CASE WHEN ${orderTickets.isScanned} THEN 1 END)`,
        })
        .from(events)
        .leftJoin(
          orderTickets,
          eq(orderTickets.eventId, events.id)
        )
        .leftJoin(orders, eq(orderTickets.orderId, orders.id))
        .groupBy(events.id, events.title, events.eventTime, events.visibility)
        .orderBy(desc(events.id))
        .limit(10),
    ]);

    const totalRevenue = Number(totalsRow[0]?.totalRevenue ?? 0);
    const paidOrderCount = Number(totalsRow[0]?.paidOrderCount ?? 0);
    const ticketCount = Number(ticketsRow[0]?.ticketCount ?? 0);
    const scannedCount = Number(scannedRow[0]?.scannedCount ?? 0);
    const pendingCount = Number(pendingRow[0]?.pendingCount ?? 0);

    const vatAmount = Math.round(totalRevenue * VAT_RATE_OF_GROSS);
    const netAmount = totalRevenue - vatAmount;

    return NextResponse.json({
      kpi: {
        totalRevenue,
        netAmount,
        vatAmount,
        paidOrderCount,
        ticketCount,
        scannedCount,
        scannedPercent: ticketCount > 0 ? (scannedCount / ticketCount) * 100 : 0,
        pendingCount,
      },
      recentOrders,
      eventSummary: eventSummary.map((e) => ({
        ...e,
        ticketCount: Number(e.ticketCount),
        scannedCount: Number(e.scannedCount),
        revenue: Number(e.revenue),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Dashboard stats error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}