import { NextResponse } from "next/server";
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

/* ======================================================
   Apply a discount code to an amount.
   ====================================================== */
function applyDiscount(
  totalCents: number,
  percentage: number
): { discountAmount: number; finalAmount: number } {
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
      method,
      idempotencyKey,
      // ⭐ NEW: optional discount code
      discountCode: rawDiscountCode,
    } = body;

    if (method !== "epassi" && method !== "edenred") {
      return NextResponse.json(
        { error: "Invalid benefit method" },
        { status: 400 }
      );
    }

    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return NextResponse.json(
        { error: "Missing idempotencyKey" },
        { status: 400 }
      );
    }

    // Sentinel value for the (NOT NULL) stripePaymentIntentId column.
    // Also serves as our idempotency lookup key.
    const sentinel = `benefit_${method}_${idempotencyKey}`;

    // ==================================================
    // IDEMPOTENCY CHECK — return existing order if we've seen this key.
    // ==================================================
    // NOTE: we return BEFORE the discount claim, because the order is
    // already created — its discount slot is already claimed. Re-claiming
    // would double-count.
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, sentinel));

    if (existing) {
      console.log(
        `Benefit checkout: returning existing order ${existing.orderNumber} for idempotency key ${idempotencyKey}`
      );
      return NextResponse.json(
        {
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          total: existing.totalPrice,
          idempotent: true,
        },
        { status: 200 }
      );
    }

    // ==================================================
    // VALIDATE CART ITEMS
    // ==================================================
    type ValidatedItem = {
      typeId: number;
      eventId: number;
      quantity: number;
      price: number;
    };

    const validatedItems: ValidatedItem[] = [];

    for (const item of cartItems) {
      if (
        !Number.isInteger(item.typeId) ||
        !Number.isInteger(item.quantity) ||
        !Number.isInteger(item.eventId) ||
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

    const eventId = validatedItems[0].eventId;

    // ==================================================
    // SUBTOTAL + DISCOUNT
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

      // ---- Atomic claim ----
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
        return NextResponse.json(
          {
            error: "Discount code has just reached its usage limit",
            code: "DISCOUNT_EXHAUSTED",
          },
          { status: 400 }
        );
      }

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
    const [seqRow] = await db
      .select()
      .from(eventSequences)
      .where(eq(eventSequences.eventId, eventId));

    if (!seqRow) {
      return NextResponse.json(
        { error: "No sequenceCode found for this event" },
        { status: 400 }
      );
    }

    const sequenceCode = seqRow.sequenceCode;

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
    // INSERT ORDER
    // ==================================================
    let orderRow;
    try {
      [orderRow] = await db
        .insert(orders)
        .values({
          eventId,
          sequenceCode,
          orderNumber,
          customerName,
          customerEmail,
          customerPhone,
          totalPrice: finalAmount, // ⭐ discounted total
          stripePaymentIntentId: sentinel,
          status: "pending_benefit",
          discountCode: discountCodeString,
          discountAmount: discountAmount > 0 ? discountAmount : null,
        })
        .returning();
    } catch (err) {
      // Race condition: another request inserted with the same sentinel
      // between our SELECT and INSERT. Re-query and return it.
      console.warn(
        `Benefit checkout: insert raced, re-querying for ${sentinel}`
      );
      const [raced] = await db
        .select()
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, sentinel));

      if (raced) {
        return NextResponse.json(
          {
            orderId: raced.id,
            orderNumber: raced.orderNumber,
            total: raced.totalPrice,
            idempotent: true,
          },
          { status: 200 }
        );
      }
      throw err;
    }

    // ==================================================
    // RECORD DISCOUNT USE
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

    return NextResponse.json(
      {
        orderId: orderRow.id,
        orderNumber: orderRow.orderNumber,
        subtotal,
        discountAmount,
        total: finalAmount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Benefit checkout error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}