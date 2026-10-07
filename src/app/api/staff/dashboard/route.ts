import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";
import { getSettings } from "@/lib/settings/getSettings";

export const runtime = "nodejs";

function deriveMethod(
  sentinel: string
): "card" | "epassi" | "edenred" {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

export async function GET(req: NextRequest) {
  try {
    // STAFF, ADMIN, SUPER_ADMIN, AUDIT can all view this
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT", "STAFF"]);

    const settings = await getSettings();
    const vatDecimal = settings.vatRateDecimal;

    // ---- Parse event filter ----
    const eventIdRaw = req.nextUrl.searchParams.get("eventId");
    const eventId =
      eventIdRaw && eventIdRaw !== "all" && eventIdRaw !== ""
        ? Number(eventIdRaw)
        : null;

    // ---- Build WHERE conditions for "paid" orders ----
    const conditions = [eq(orders.status, "paid")];
    if (eventId !== null && Number.isInteger(eventId)) {
      conditions.push(eq(orders.eventId, eventId));
    }

    // ---- Fetch paid orders in scope ----
    const orderRows = await db
      .select({
        id: orders.id,
        eventId: orders.eventId,
        eventTitle: events.title,
        totalPrice: orders.totalPrice,
        sentinel: orders.stripePaymentIntentId,
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(and(...conditions));

    // ---- Ticket counts per order ----
    const orderIds = orderRows.map((o) => o.id);
    const ticketStats = new Map<
      number,
      { total: number; scanned: number }
    >();

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
        const cur = ticketStats.get(t.orderId) ?? {
          total: 0,
          scanned: 0,
        };
        cur.total += 1;
        if (t.isScanned) cur.scanned += 1;
        ticketStats.set(t.orderId, cur);
      }
    }

    // ---- KPI aggregation ----
    let totalRevenue = 0;
    let totalTickets = 0;
    let totalScanned = 0;

    const methodTotals = {
      card: 0,
      epassi: 0,
      edenred: 0,
    };

    // Per-event aggregation
    const perEventMap = new Map<
      number,
      {
        eventId: number;
        eventTitle: string;
        orderCount: number;
        ticketCount: number;
        scannedCount: number;
        revenue: number;
      }
    >();

    for (const o of orderRows) {
      const stats = ticketStats.get(o.id) ?? { total: 0, scanned: 0 };

      totalRevenue += o.totalPrice;
      totalTickets += stats.total;
      totalScanned += stats.scanned;

      const method = deriveMethod(o.sentinel);
      methodTotals[method] += o.totalPrice;

      const key = o.eventId;
      const existing = perEventMap.get(key) ?? {
        eventId: o.eventId,
        eventTitle: o.eventTitle ?? "—",
        orderCount: 0,
        ticketCount: 0,
        scannedCount: 0,
        revenue: 0,
      };
      existing.orderCount += 1;
      existing.ticketCount += stats.total;
      existing.scannedCount += stats.scanned;
      existing.revenue += o.totalPrice;
      perEventMap.set(key, existing);
    }

    const perEvent = Array.from(perEventMap.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    const vatAmount = Math.round(totalRevenue * vatDecimal);
    const netAmount = totalRevenue - vatAmount;

    // ---- Available events for the filter dropdown ----
    const availableEvents = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .orderBy(desc(events.id));

    // ---- Active / ongoing event info ----
    // If the filter is "all events", pick the first "ongoing" event so
    // the staff dashboard can highlight the current one.
    let ongoingEvent: { id: number; title: string } | null = null;
    if (eventId === null) {
      const [ongoing] = await db
        .select({ id: events.id, title: events.title })
        .from(events)
        .where(eq(events.visibility, "ongoing"))
        .orderBy(desc(events.id))
        .limit(1);
      if (ongoing) {
        ongoingEvent = { id: ongoing.id, title: ongoing.title };
      }
    } else {
      const [selected] = await db
        .select({ id: events.id, title: events.title })
        .from(events)
        .where(eq(events.id, eventId));
      if (selected) ongoingEvent = selected;
    }

    return NextResponse.json({
      kpi: {
        totalRevenue,
        netAmount,
        vatAmount,
        vatRatePercent: settings.vatRatePercent,
        ticketCount: totalTickets,
        scannedCount: totalScanned,
        scannedPercent:
          totalTickets > 0 ? (totalScanned / totalTickets) * 100 : 0,
        orderCount: orderRows.length,
      },
      byMethod: methodTotals,
      perEvent,
      availableEvents,
      ongoingEvent,
      filter: {
        eventId,
        isAllEvents: eventId === null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    console.error("Staff dashboard error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}