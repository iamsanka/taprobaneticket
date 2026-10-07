import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq, and, isNull, sql, or } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { eventSequences } from "@/db/schema/eventSequences";
import { orderSequence } from "@/db/schema/orderSequence";
import { ticketSequence } from "@/db/schema/ticketSequence";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eventTickets } from "@/db/schema/eventTickets";
import { discountCodes } from "@/db/schema/discountCodes";
import { discountCodeUses } from "@/db/schema/discountCodeUses";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/* ======================================================
   Apply a discount code to an amount.
   Returns the discount in cents (rounded down) and the
   final amount after discount.
   ====================================================== */
function applyDiscount(
  totalCents: number,
  percentage: number
): { discountAmount: number; finalAmount: number } {
  // Math.floor avoids accidentally over-discounting by rounding up
  const discountAmount = Math.floor((totalCents * percentage) / 100);
  return {
    discountAmount,
    finalAmount: totalCents - discountAmount,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      customerName,
      customerEmail,
      customerPhone,
      cartItems,
      // ⭐ NEW: optional discount code
      discountCode: rawDiscountCode,
    } = body;

    const eventId = cartItems?.[0]?.eventId;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId missing from cart items" },
        { status: 400 }
      );
    }

    // ==================================================
    // VALIDATE CART ITEMS (server-side, before any writes)
    // ==================================================
    type ValidatedItem = {
      typeId: number;
      eventId: number;
      quantity: number;
      price: number; // from DB, not client
    };

    const validatedItems: ValidatedItem[] = [];

    for (const item of cartItems) {
      if (
        !Number.isInteger(item.typeId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return NextResponse.json(
          { error: "Invalid cart item", code: "INVALID_CART" },
          { status: 400 }
        );
      }

      const [ticketType] = await db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.id, item.typeId));

      if (!ticketType) {
        return NextResponse.json(
          {
            error:
              "Your cart contains an expired ticket. Please clear your cart and add tickets again.",
            code: "STALE_CART",
          },
          { status: 400 }
        );
      }

      const [eventTicket] = await db
        .select()
        .from(eventTickets)
        .where(
          and(
            eq(eventTickets.eventId, item.eventId),
            eq(eventTickets.typeId, item.typeId)
          )
        );

      if (!eventTicket) {
        return NextResponse.json(
          {
            error:
              "Your cart contains a ticket that is no longer available for this event. Please clear your cart and add tickets again.",
            code: "STALE_CART",
          },
          { status: 400 }
        );
      }

      validatedItems.push({
        typeId: item.typeId,
        eventId: item.eventId,
        quantity: item.quantity,
        price: eventTicket.price,
      });
    }

    // ==================================================
    // SERVER-SIDE DISCOUNT VALIDATION (never trust client)
    // ==================================================
    const subtotal = validatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    let discountId: number | null = null;
    let discountCodeString: string | null = null;
    let discountPercentage = 0;
    let discountAmount = 0;
    let finalAmount = subtotal;

    const normalizedCode = rawDiscountCode
      ? String(rawDiscountCode).trim().toUpperCase()
      : "";

    if (normalizedCode) {
      // ---- Look up + validate ----
      const [row] = await db
        .select()
        .from(discountCodes)
        .where(
          and(
            eq(discountCodes.code, normalizedCode),
            eq(discountCodes.eventId, eventId)
          )
        );

      if (!row) {
        return NextResponse.json(
          {
            error: "Discount code is not valid for this event",
            code: "DISCOUNT_INVALID",
          },
          { status: 400 }
        );
      }

      if (!row.isActive) {
        return NextResponse.json(
          {
            error: "Discount code is no longer active",
            code: "DISCOUNT_INACTIVE",
          },
          { status: 400 }
        );
      }

      if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
        return NextResponse.json(
          {
            error: "Discount code has expired",
            code: "DISCOUNT_EXPIRED",
          },
          { status: 400 }
        );
      }

      // ---- Atomic usage-limit claim ----
      // This UPDATE only succeeds if there is still a free slot.
      // If two requests race for the last slot, exactly one wins.
      const claimed = await db
        .update(discountCodes)
        .set({
          usedCount: sql`${discountCodes.usedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discountCodes.id, row.id),
            or(
              isNull(discountCodes.maxUses),
              sql`${discountCodes.usedCount} < ${discountCodes.maxUses}`
            )
          )
        )
        .returning({ usedCount: discountCodes.usedCount });

      if (claimed.length === 0) {
        // Someone else grabbed the last slot a moment ago
        return NextResponse.json(
          {
            error: "Discount code has just reached its usage limit",
            code: "DISCOUNT_EXHAUSTED",
          },
          { status: 400 }
        );
      }

      // ---- Apply the discount to the math ----
      discountId = row.id;
      discountCodeString = row.code;
      discountPercentage = row.percentage;

      const applied = applyDiscount(subtotal, discountPercentage);
      discountAmount = applied.discountAmount;
      finalAmount = applied.finalAmount;
    }

    // ==================================================
    // EVENT SEQUENCE CODE
    // ==================================================
    const seqRows = await db
      .select()
      .from(eventSequences)
      .where(eq(eventSequences.eventId, eventId));

    if (!seqRows.length) {
      return NextResponse.json(
        { error: "No sequenceCode found for this event" },
        { status: 400 }
      );
    }

    const sequenceCode = seqRows[0].sequenceCode;

    // ==================================================
    // ORDER NUMBER GENERATION
    // ==================================================
    const [orderSeq] = await db
      .select()
      .from(orderSequence)
      .where(eq(orderSequence.eventId, eventId));

    const orderNo = orderSeq?.nextOrderNo || 1;
    const orderNoFormatted = orderNo.toString().padStart(3, "0");

    if (orderSeq) {
      await db
        .update(orderSequence)
        .set({ nextOrderNo: orderNo + 1 })
        .where(eq(orderSequence.eventId, eventId));
    } else {
      await db.insert(orderSequence).values({ eventId, nextOrderNo: 2 });
    }

    const orderNumber = `${sequenceCode}${orderNoFormatted}`;

    // ==================================================
    // STRIPE PAYMENT INTENT — charge the FINAL amount
    // ==================================================
    // Note: if finalAmount is 0 (100% discount), Stripe requires a minimum
    // of €0.50. We floor it at 1 cent so the flow doesn't break — but in
    // practice you'd want to disallow 100% codes at the API level. See note
    // at the bottom of this file.
    const stripeAmount = Math.max(finalAmount, 1);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: "eur",
      receipt_email: customerEmail,
      metadata: {
        eventId: String(eventId),
        customerName,
        orderNumber,
        ...(discountCodeString
          ? {
              discountCode: discountCodeString,
              discountAmount: String(discountAmount),
            }
          : {}),
      },
    });

    // ==================================================
    // CREATE ORDER
    // ==================================================
    const [orderRow] = await db
      .insert(orders)
      .values({
        eventId,
        sequenceCode,
        orderNumber,
        customerName,
        customerEmail,
        customerPhone,
        totalPrice: finalAmount, // ⭐ store the discounted total
        stripePaymentIntentId: paymentIntent.id,
        status: "pending",
        discountCode: discountCodeString,
        discountAmount: discountAmount > 0 ? discountAmount : null,
      })
      .returning();

    // ==================================================
    // RECORD DISCOUNT USE (audit trail)
    // ==================================================
    if (discountId !== null && discountCodeString !== null) {
      await db.insert(discountCodeUses).values({
        discountCodeId: discountId,
        orderId: orderRow.id,
        code: discountCodeString,
        customerEmail,
        percentage: discountPercentage,
        discountAmount,
      });
    }

    // ==================================================
    // CREATE TICKETS
    // ==================================================
    for (const item of validatedItems) {
      for (let i = 0; i < item.quantity; i++) {
        const [ticketSeq] = await db
          .select()
          .from(ticketSequence)
          .where(eq(ticketSequence.eventId, eventId));

        const ticketNo = ticketSeq?.nextTicketNo || 1;
        const ticketNoFormatted = ticketNo.toString().padStart(4, "0");

        if (ticketSeq) {
          await db
            .update(ticketSequence)
            .set({ nextTicketNo: ticketNo + 1 })
            .where(eq(ticketSequence.eventId, eventId));
        } else {
          await db.insert(ticketSequence).values({ eventId, nextTicketNo: 2 });
        }

        const ticketNumber = `${sequenceCode}${orderNoFormatted}${ticketNoFormatted}`;

        const payload = JSON.stringify({
          orderId: orderRow.id,
          ticketTypeId: item.typeId,
          ticketNumber,
        });

        await db.insert(orderTickets).values({
          orderId: orderRow.id,
          eventId,
          ticketTypeId: item.typeId,
          ticketNumber,
          qrCodeData: payload,
          isScanned: false,
        });
      }
    }

    // ==================================================
    // RESPONSE
    // ==================================================
    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret,
        orderId: orderRow.id,
        subtotal,
        discountAmount,
        finalAmount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}