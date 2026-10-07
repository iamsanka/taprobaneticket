import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { getSession, AuthError } from "@/lib/auth/getSession";
import { getSettings } from "@/lib/settings/getSettings";

export const runtime = "nodejs";

function derivePaymentMethod(sentinel: string): "card" | "epassi" | "edenred" {
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
    const orderId = Number(id);

    if (!Number.isInteger(orderId)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const settings = await getSettings();

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [eventRow] = await db
      .select()
      .from(events)
      .where(eq(events.id, order.eventId));

    const ticketRows = await db
      .select({
        id: orderTickets.id,
        ticketNumber: orderTickets.ticketNumber,
        qrCodeData: orderTickets.qrCodeData,
        isScanned: orderTickets.isScanned,
        scannedAt: orderTickets.scannedAt,
        categoryName: ticketCategories.name,
        typeName: ticketTypes.name,
      })
      .from(orderTickets)
      .leftJoin(ticketTypes, eq(orderTickets.ticketTypeId, ticketTypes.id))
      .leftJoin(
        ticketCategories,
        eq(ticketTypes.categoryId, ticketCategories.id)
      )
      .where(eq(orderTickets.orderId, order.id));

    const method = derivePaymentMethod(order.stripePaymentIntentId);

    // ---- Amounts ----
    // order.totalPrice is already the discounted total.
    // The subtotal is totalPrice + discountAmount.
    const discountAmount = order.discountAmount ?? 0;
    const finalTotal = order.totalPrice;
    const subtotal = finalTotal + discountAmount;

    // VAT on the FINAL (discounted) amount, not on the subtotal
    const vatAmount = Math.round(finalTotal * settings.vatRateDecimal);
    const netAmount = finalTotal - vatAmount;

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,

        // Amounts
        totalPrice: finalTotal,      // renamed for clarity in UI
        subtotal,                     // ⭐ NEW: pre-discount
        discountCode: order.discountCode ?? null, // ⭐ NEW
        discountAmount: discountAmount,           // ⭐ NEW

        paidAt: order.paidAt,
        ticketEmailSentAt: order.ticketEmailSentAt,
        updatedAt: order.updatedAt,
      },
      event: eventRow
        ? {
            id: eventRow.id,
            title: eventRow.title,
            eventTime: eventRow.eventTime,
            location: eventRow.location,
          }
        : null,
      tickets: ticketRows,
      paymentMethod: method,
      vatAmount,
      netAmount,
      vatRatePercent: settings.vatRatePercent,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Order detail error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}