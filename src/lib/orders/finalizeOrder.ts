import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { eventTickets } from "@/db/schema/eventTickets";
import { generateQrCode } from "@/lib/qr/generateQrCode";
import { signTicketQr } from "@/lib/qr/signQrPayload";
import { generateTicketPdf } from "@/lib/pdf/generateTicketPdf";
import { generateInvoicePdf } from "@/lib/pdf/generateInvoicePdf";
import { sendTicketDelivery } from "@/lib/email/sendTicketDelivery";
import { getSettings } from "@/lib/settings/getSettings";

export type FinalizeResult =
  | { ok: true; orderNumber: string; ticketCount: number }
  | { ok: false; reason: "already_finalized" | "not_paid" | "not_found" }
  | { ok: false; reason: "error"; error: unknown };

/**
 * Marks an order as paid, generates QR codes + PDFs, sends the ticket
 * delivery email, and stamps ticketEmailSentAt.
 *
 * - Normal mode: idempotent, one caller wins the atomic claim.
 * - forceResend mode: skips the claim, re-sends for an order that's already
 *   been paid. Used by the admin "Resend Ticket Email" button.
 */
export async function finalizeOrder(
  orderId: number,
  options?: { forceResend?: boolean }
): Promise<FinalizeResult> {
  const forceResend = options?.forceResend ?? false;

  let order: typeof orders.$inferSelect;

  if (forceResend) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!existing) {
      return { ok: false, reason: "not_found" };
    }

    if (!existing.paidAt) {
      return { ok: false, reason: "not_paid" };
    }

    order = existing;
  } else {
    const claimed = await db
      .update(orders)
      .set({
        paidAt: new Date(),
        status: "paid",
        ticketEmailSentAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), isNull(orders.ticketEmailSentAt)))
      .returning();

    if (claimed.length === 0) {
      return { ok: false, reason: "already_finalized" };
    }

    order = claimed[0];
  }

  try {
    // ---- Load settings once — used by both PDFs ----
    // Single cached read; subsequent calls in the same request window hit
    // memory, not the DB.
    const settings = await getSettings();

    // ---- Load tickets with category + type names ----
    const ticketRows = await db
      .select({
        id: orderTickets.id,
        ticketNumber: orderTickets.ticketNumber,
        qrCodeData: orderTickets.qrCodeData,
        ticketTypeId: orderTickets.ticketTypeId,
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

    if (!ticketRows.length) {
      throw new Error(
        `no tickets found for order ${order.orderNumber} (id ${order.id})`
      );
    }

    const [eventRow] = await db
      .select()
      .from(events)
      .where(eq(events.id, order.eventId));

    if (!eventRow) {
      throw new Error(
        `event ${order.eventId} not found for order ${order.orderNumber}`
      );
    }

    const eventTicketRows = await db
      .select()
      .from(eventTickets)
      .where(eq(eventTickets.eventId, order.eventId));

    const priceByTypeId = new Map<number, number>(
      eventTicketRows.map((et) => [et.typeId, et.price])
    );

    const orderInfo = {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      eventTitle: eventRow.title,
      eventTime: eventRow.eventTime,
      eventLocation: eventRow.location,
      brandName: settings.brandName,   // ⭐ from settings
    };

    // ---- One PDF per ticket ----
    // QR encodes a signed payload:
    //   <ticketNumber>.<hmac>
    const attachments = await Promise.all(
      ticketRows.map(async (t) => {
        const signedPayload = signTicketQr(t.ticketNumber);
        const qr = await generateQrCode(signedPayload);

        const pdfBytes = await generateTicketPdf(orderInfo, {
          ticketNumber: t.ticketNumber,
          qrDataUrl: qr.dataUrl,
          categoryName: t.categoryName ?? undefined,
          typeName: t.typeName ?? undefined,
        });

        return {
          filename: `ticket-${t.ticketNumber}.pdf`,
          content: pdfBytes,
        };
      })
    );

    // ---- Group tickets → invoice line items ----
    type Grouped = { description: string; quantity: number; unitPrice: number };
    const grouped = new Map<number, Grouped>();

    for (const t of ticketRows) {
      const unitPrice = priceByTypeId.get(t.ticketTypeId) ?? 0;
      const existing = grouped.get(t.ticketTypeId);
      if (existing) {
        existing.quantity += 1;
      } else {
        const description = [t.categoryName, t.typeName]
          .filter(Boolean)
          .join(" — ");
        grouped.set(t.ticketTypeId, {
          description: description || `Ticket type ${t.ticketTypeId}`,
          quantity: 1,
          unitPrice,
        });
      }
    }

    const lineItems = Array.from(grouped.values());

    const invoicePdf = await generateInvoicePdf({
      invoiceNumber: order.orderNumber,
      invoiceDate: new Date(),
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      eventTitle: eventRow.title,
      eventTime: eventRow.eventTime,
      eventLocation: eventRow.location,
      lineItems,
      total: order.totalPrice,
      vatRatePercent: settings.vatRatePercent,   // ⭐ from settings
      brandName: settings.brandName,             // ⭐ from settings
    });

    // ---- Send email ----
    await sendTicketDelivery({
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderNumber: order.orderNumber,
      eventTitle: eventRow.title,
      eventTime: eventRow.eventTime,
      eventLocation: eventRow.location,
      ticketCount: ticketRows.length,
      attachments,
      invoicePdf,
      invoiceNumber: order.orderNumber,
    });

    // ---- Update ticketEmailSentAt ----
    await db
      .update(orders)
      .set({ ticketEmailSentAt: new Date() })
      .where(eq(orders.id, order.id));

    console.log(
      `finalizeOrder${forceResend ? " (resend)" : ""}: email sent for order ${order.orderNumber} (${ticketRows.length} tickets, VAT ${settings.vatRatePercent}%)`
    );

    return {
      ok: true,
      orderNumber: order.orderNumber,
      ticketCount: ticketRows.length,
    };
  } catch (err) {
    console.error(
      `finalizeOrder: failed for order ${order.orderNumber}`,
      err
    );

    if (!forceResend) {
      await db
        .update(orders)
        .set({ ticketEmailSentAt: null })
        .where(eq(orders.id, order.id));
    }

    return { ok: false, reason: "error", error: err };
  }
}