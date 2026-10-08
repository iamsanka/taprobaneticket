import { eq, and, isNull, isNotNull, inArray, or } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { events } from "@/db/schema/events";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { ticketCategories } from "@/db/schema/ticketCategories";
import { eventTickets } from "@/db/schema/eventTickets";
import { seats } from "@/db/schema/seats";
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
 *
 * ⭐ NEW — seat booking:
 *   For seated orders (card flow), any seats held by the customer are
 *   converted to permanently booked here. The booking is conditional
 *   (`booked_order_id IS NULL OR = $orderId`) so re-runs are idempotent.
 *   If a seat was re-claimed by another customer between PI creation
 *   and webhook delivery (rare — hold is 30 min), we log a conflict
 *   and proceed: the customer paid, and failing the webhook would
 *   just cause infinite Stripe retries. An admin must intervene.
 *
 *   The BENEFIT flow books seats at order creation (see
 *   /api/checkout/benefit), so by the time finalizeOrder runs on a
 *   benefit order the seats are already booked. The conditional
 *   UPDATE is a no-op in that case.
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
    // ==================================================
    // ⭐ NEW — BOOK SEATS (card flow only)
    // ==================================================
    // Skip on forceResend: seats are already booked, nothing to do.
    // Skip when the order has no seats (GA tickets).
    if (!forceResend) {
      const ticketSeatRows = await db
        .select({ seatId: orderTickets.seatId })
        .from(orderTickets)
        .where(
          and(
            eq(orderTickets.orderId, order.id),
            isNotNull(orderTickets.seatId)
          )
        );

      const seatIds = ticketSeatRows
        .map((r) => r.seatId)
        .filter((id): id is number => id !== null);

      if (seatIds.length > 0) {
        // Conditional booking: only book if the seat is either free
        // (not booked) OR already booked by THIS order (idempotent
        // retry). This is the atomic operation that prevents a
        // "second customer steals the seat" race.
        const booked = await db
          .update(seats)
          .set({
            bookedOrderId: order.id,
            heldByToken: null,
            holdExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              inArray(seats.id, seatIds),
              or(
                isNull(seats.bookedOrderId),
                eq(seats.bookedOrderId, order.id)
              )
            )
          )
          .returning({ id: seats.id });

        if (booked.length !== seatIds.length) {
          // ⚠️ Rare race: hold expired between PI creation and webhook,
          // and another customer claimed the seat. Log loudly — this
          // is greppable for ops. Do NOT throw: the customer paid, and
          // failing here just makes Stripe retry forever.
          const bookedSet = new Set(booked.map((b) => b.id));
          const lostSeatIds = seatIds.filter((id) => !bookedSet.has(id));
          console.error(
            `[finalizeOrder] ⚠️ SEAT CONFLICT for order ${order.orderNumber} (id ${order.id}): ` +
              `${booked.length}/${seatIds.length} seats booked. ` +
              `Lost seat IDs: [${lostSeatIds.join(", ")}]. ` +
              `Manual admin review required (refund or reseat).`
          );
        } else {
          console.log(
            `finalizeOrder: booked ${booked.length} seat(s) for order ${order.orderNumber}`
          );
        }
      }
    }

    // ---- Load settings once — used by both PDFs ----
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
        seatLabel: orderTickets.seatLabel,
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
      brandName: settings.brandName,
       // ⭐ NEW — pass ticket design through to the PDF
      ticketImageUrl: eventRow.ticketImageUrl ?? undefined,
      ticketImageTextColor:
        (eventRow.ticketImageTextColor as "light" | "dark" | null) ?? undefined,
    };

    // ---- One PDF per ticket ----
    const attachments = await Promise.all(
      ticketRows.map(async (t) => {
        const signedPayload = signTicketQr(t.ticketNumber);
        const qr = await generateQrCode(signedPayload);

        const pdfBytes = await generateTicketPdf(orderInfo, {
          ticketNumber: t.ticketNumber,
          qrDataUrl: qr.dataUrl,
          categoryName: t.categoryName ?? undefined,
          typeName: t.typeName ?? undefined,
          seatLabel: t.seatLabel ?? undefined,
          unitPrice: priceByTypeId.get(t.ticketTypeId) ?? undefined,
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
      vatRatePercent: settings.vatRatePercent,
      brandName: settings.brandName,
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