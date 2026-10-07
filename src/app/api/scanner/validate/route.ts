import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { getSession, AuthError } from "@/lib/auth/getSession";
import { verifyTicketQr } from "@/lib/qr/signQrPayload";

export const runtime = "nodejs";

type ScanStatus = "valid" | "already_scanned" | "invalid";

export async function POST(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "STAFF"]);

    const body = await req.json();
    const { qrCodeData } = body;

    if (typeof qrCodeData !== "string" || !qrCodeData.trim()) {
      return NextResponse.json(
        { status: "invalid", reason: "Empty QR payload" },
        { status: 200 }
      );
    }

    // ---- 1. Verify the QR ----
    // Accepts three formats:
    //   - Signed JSON   {"ticketNumber":"...","sig":"..."}  → verified
    //   - Legacy JSON   {"orderId":...,"ticketNumber":"..."} → unsigned
    //   - Raw string    "taprosa20260010001"                → unsigned
    const verification = verifyTicketQr(qrCodeData);

    if (!verification.ok) {
      return NextResponse.json(
        {
          status: "invalid",
          reason: verification.reason,
        },
        { status: 200 }
      );
    }

    const { ticketNumber, signed } = verification;

    // ---- 2. Look up the ticket ----
    const [ticket] = await db
      .select({
        id: orderTickets.id,
        ticketNumber: orderTickets.ticketNumber,
        isScanned: orderTickets.isScanned,
        scannedAt: orderTickets.scannedAt,
        orderId: orderTickets.orderId,
        categoryName: ticketCategories.name,
        typeName: ticketTypes.name,
      })
      .from(orderTickets)
      .leftJoin(ticketTypes, eq(orderTickets.ticketTypeId, ticketTypes.id))
      .leftJoin(
        ticketCategories,
        eq(ticketTypes.categoryId, ticketCategories.id)
      )
      .where(eq(orderTickets.ticketNumber, ticketNumber));

    if (!ticket) {
      return NextResponse.json(
        {
          status: "invalid",
          reason: "Ticket not found",
          ticketNumber,
        },
        { status: 200 }
      );
    }

    // ---- 3. Load order + verify paid ----
    const [order] = await db
      .select({
        customerName: orders.customerName,
        eventId: orders.eventId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, ticket.orderId));

    if (!order || order.status !== "paid") {
      return NextResponse.json(
        {
          status: "invalid",
          reason: order
            ? `Order status is "${order.status}" — ticket is not valid`
            : "Order not found",
          ticketNumber,
        },
        { status: 200 }
      );
    }

    const [eventRow] = await db
      .select({
        title: events.title,
        eventTime: events.eventTime,
        location: events.location,
      })
      .from(events)
      .where(eq(events.id, order.eventId));

    const ticketInfo = {
      ticketNumber: ticket.ticketNumber,
      categoryName: ticket.categoryName ?? "—",
      typeName: ticket.typeName ?? "—",
      customerName: order.customerName,
      eventTitle: eventRow?.title ?? "—",
      eventTime: eventRow?.eventTime ?? "—",
      eventLocation: eventRow?.location ?? "—",
      signed,
    };

    // ---- 4. Already scanned? ----
    if (ticket.isScanned) {
      return NextResponse.json(
        {
          status: "already_scanned" as ScanStatus,
          ticket: ticketInfo,
          scannedAt: ticket.scannedAt,
        },
        { status: 200 }
      );
    }

    // ---- 5. Atomic claim ----
    const updated = await db
      .update(orderTickets)
      .set({ isScanned: true, scannedAt: new Date() })
      .where(
        and(eq(orderTickets.id, ticket.id), eq(orderTickets.isScanned, false))
      )
      .returning({ scannedAt: orderTickets.scannedAt });

    if (updated.length === 0) {
      return NextResponse.json(
        {
          status: "already_scanned" as ScanStatus,
          ticket: ticketInfo,
          scannedAt: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        status: "valid" as ScanStatus,
        ticket: ticketInfo,
        scannedAt: updated[0].scannedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Scanner validate error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}