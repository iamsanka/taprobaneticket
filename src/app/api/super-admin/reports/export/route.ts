import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

function derivePaymentMethod(
  sentinel: string
): "card" | "epassi" | "edenred" {
  if (sentinel.startsWith("benefit_epassi_")) return "epassi";
  if (sentinel.startsWith("benefit_edenred_")) return "edenred";
  return "card";
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote if it contains comma, quote, or newline
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(iso: string | Date | null): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    // ---- Parse filters (same as /reports) ----
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
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    // ---- WHERE ----
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

    // ---- Fetch orders ----
    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        eventId: orders.eventId,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        totalPrice: orders.totalPrice,
        // ⭐ NEW — discount snapshot
        discountCode: orders.discountCode,
        discountAmount: orders.discountAmount,
        status: orders.status,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        eventTitle: events.title,
        eventTime: events.eventTime,
        eventLocation: events.location,
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.id));

    // Method filter in JS
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

    // ---- Build CSV ----
    // ⭐ NEW columns: Gross (EUR), Discount Code, Discount (EUR)
    // Placed just before Total so the reader sees:
    //   Gross  →  −Discount  →  Total
    const headers = [
      "Order Number",
      "Created",
      "Paid",
      "Status",
      "Method",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Event",
      "Event Time",
      "Event Location",
      "Ticket Count",
      "Scanned",
      "Gross (EUR)",       // ⭐ pre-discount
      "Discount Code",     // ⭐
      "Discount (EUR)",    // ⭐
      "Total (EUR)",       // post-discount (unchanged)
    ];

    const lines: string[] = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const o of filteredOrders) {
      const counts = ticketCounts.get(o.id) ?? { total: 0, scanned: 0 };
      const method = derivePaymentMethod(o.stripePaymentIntentId);
      const discountAmount = o.discountAmount ?? 0;
      // Gross = what would have been charged (Total + Discount)
      const gross = o.totalPrice + discountAmount;

      const row = [
        o.orderNumber,
        formatDate(o.createdAt),
        formatDate(o.paidAt),
        o.status,
        method,
        o.customerName,
        o.customerEmail,
        o.customerPhone,
        o.eventTitle ?? "",
        o.eventTime ?? "",
        o.eventLocation ?? "",
        counts.total,
        counts.scanned,
        formatEuro(gross),                // ⭐
        o.discountCode ?? "",             // ⭐ blank when no discount
        formatEuro(discountAmount),       // ⭐ 0.00 when no discount
        formatEuro(o.totalPrice),
      ];
      lines.push(row.map(csvEscape).join(","));
    }

    // ---- Add UTF-8 BOM so Excel opens with correct encoding ----
    const csv = "\uFEFF" + lines.join("\r\n");

    // ---- Filename with date range if provided ----
    const parts: string[] = ["orders-report"];
    if (dateFromRaw) parts.push(dateFromRaw);
    if (dateToRaw) parts.push(dateToRaw);
    const filename = `${parts.join("_")}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("CSV export error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}