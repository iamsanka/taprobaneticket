import { NextResponse } from "next/server";
import { eq, and, isNull, inArray, or, sql } from "drizzle-orm";
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
import { seatingMaps } from "@/db/schema/seatingMaps";
import { seatingSections } from "@/db/schema/seatingSections";
import { seats } from "@/db/schema/seats";

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
      // ⭐ NEW — seat selection
      seatToken: rawSeatToken,
      seatIds: rawSeatIds,
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
    // IDEMPOTENCY CHECK
    // ==================================================
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
      categoryId: number; // ⭐ NEW — needed for seat assignment
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
        categoryId: ticketType.categoryId, // ⭐
        eventId: item.eventId,
        quantity: item.quantity,
        price: eventTicket.price,
      });
    }

    const eventId = validatedItems[0].eventId;

    // ==================================================
    // ⭐ VALIDATE + BOOK SEAT HOLDS (if provided)
    // ==================================================
    // For the benefit flow, seats are BOOKED here (not just held).
    // Rationale: the admin will confirm payment manually hours later,
    // and we can't keep the seats held for that long. Instead, we
    // reserve them outright; if the order is later cancelled, the
    // cancel flow releases them.
    //
    // v1 constraint: one seated category per order.
    let seatAssignments: Array<{
      seatId: number;
      seatLabel: string;
      categoryId: number;
    }> = [];

    const hasSeats = Array.isArray(rawSeatIds) && rawSeatIds.length > 0;

    if (hasSeats) {
      if (typeof rawSeatToken !== "string" || rawSeatToken.length < 8) {
        return NextResponse.json(
          {
            error: "seatToken is required when seatIds are provided",
            code: "MISSING_SEAT_TOKEN",
          },
          { status: 400 }
        );
      }

      const seatIdSet = new Set<number>();
      for (const raw of rawSeatIds) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json(
            {
              error: "seatIds must contain positive integers",
              code: "INVALID_SEATS",
            },
            { status: 400 }
          );
        }
        seatIdSet.add(n);
      }
      const seatIds = Array.from(seatIdSet);

      const seatRows = await db
        .select()
        .from(seats)
        .where(inArray(seats.id, seatIds));

      if (seatRows.length !== seatIds.length) {
        return NextResponse.json(
          {
            error: "One or more seats no longer exist",
            code: "SEAT_UNAVAILABLE",
          },
          { status: 409 }
        );
      }

      const uniqueMapIds = new Set(seatRows.map((s) => s.mapId));
      if (uniqueMapIds.size !== 1) {
        return NextResponse.json(
          {
            error: "All seats must belong to the same seating map",
            code: "SEATS_DIFFERENT_MAPS",
          },
          { status: 400 }
        );
      }
      const seatMapId = seatRows[0].mapId;

      const [seatMap] = await db
        .select()
        .from(seatingMaps)
        .where(eq(seatingMaps.id, seatMapId));

      if (!seatMap || seatMap.eventId !== eventId) {
        return NextResponse.json(
          {
            error: "Seats do not belong to this event",
            code: "SEATS_WRONG_EVENT",
          },
          { status: 400 }
        );
      }

      const seatedCategoryId = seatMap.categoryId;

      const expectedSeats = validatedItems
        .filter((i) => i.categoryId === seatedCategoryId)
        .reduce((sum, i) => sum + i.quantity, 0);

      if (expectedSeats === 0) {
        return NextResponse.json(
          {
            error: "Cart contains no tickets for the seating category",
            code: "SEATS_NO_MATCHING_ITEMS",
          },
          { status: 400 }
        );
      }

      if (expectedSeats !== seatIds.length) {
        return NextResponse.json(
          {
            error: `Expected ${expectedSeats} ${
              expectedSeats === 1 ? "seat" : "seats"
            } for this order, but received ${seatIds.length}.`,
            code: "SEATS_COUNT_MISMATCH",
          },
          { status: 400 }
        );
      }

      // Every seat must be held by this token and still valid
      const now = new Date();
      for (const s of seatRows) {
        if (s.isBlocked) {
          return NextResponse.json(
            {
              error: "One or more selected seats are no longer available",
              code: "SEAT_UNAVAILABLE",
              unavailableSeatIds: [s.id],
            },
            { status: 409 }
          );
        }
        if (s.bookedOrderId !== null) {
          return NextResponse.json(
            {
              error: "One or more selected seats have already been booked",
              code: "SEAT_UNAVAILABLE",
              unavailableSeatIds: [s.id],
            },
            { status: 409 }
          );
        }
        if (s.heldByToken !== rawSeatToken) {
          return NextResponse.json(
            {
              error:
                "Your seat hold has expired or was released. Please select seats again.",
              code: "SEAT_EXPIRED",
              unavailableSeatIds: [s.id],
            },
            { status: 409 }
          );
        }
        if (!s.holdExpiresAt || s.holdExpiresAt <= now) {
          return NextResponse.json(
            {
              error:
                "Your seat hold has expired. Please select seats again.",
              code: "SEAT_EXPIRED",
            },
            { status: 409 }
          );
        }
      }

      // Fetch labels for snapshotting
      const seatLabelsRaw = await db
        .select({
          seatId: seats.id,
          rowLabel: seats.rowLabel,
          numberLabel: seats.numberLabel,
          sectionLabel: seatingSections.label,
        })
        .from(seats)
        .leftJoin(seatingSections, eq(seatingSections.id, seats.sectionId))
        .where(inArray(seats.id, seatIds));

      const totalSectionsInMap = await db
        .select({ id: seatingSections.id })
        .from(seatingSections)
        .where(eq(seatingSections.mapId, seatMapId));
      const multiSection = totalSectionsInMap.length > 1;
      const singleMain =
        totalSectionsInMap.length === 1 &&
        (seatLabelsRaw[0]?.sectionLabel ?? "").toLowerCase() === "main";
      const hidePrefix = !multiSection || singleMain;

      seatAssignments = seatLabelsRaw.map((r) => ({
        seatId: r.seatId,
        seatLabel: hidePrefix
          ? `${r.rowLabel}${r.numberLabel}`
          : `${r.sectionLabel ?? "?"}-${r.rowLabel}${r.numberLabel}`,
        categoryId: seatedCategoryId,
      }));
    }

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
    // INSERT ORDER (with race-safe retry)
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
          totalPrice: finalAmount,
          stripePaymentIntentId: sentinel,
          status: "pending_benefit",
          discountCode: discountCodeString,
          discountAmount: discountAmount > 0 ? discountAmount : null,
        })
        .returning();
    } catch (err) {
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
    // ⭐ BOOK SEATS (atomic, conditional)
    // ==================================================
    // We book the seats against this order now. The WHERE clause
    // re-verifies the hold is still ours at write time, so a
    // concurrent expiry/re-hold by another customer can't slip in.
    if (hasSeats && seatAssignments.length > 0) {
      const booked = await db
        .update(seats)
        .set({
          bookedOrderId: orderRow.id,
          heldByToken: null,
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(
              seats.id,
              seatAssignments.map((s) => s.seatId)
            ),
            eq(seats.heldByToken, rawSeatToken as string)
          )
        )
        .returning({ id: seats.id });

      if (booked.length !== seatAssignments.length) {
        // We lost the race — someone re-held or the hold expired in
        // the millisecond between validation and this UPDATE.
        // Roll back by deleting the order + tickets we just made.
        //
        // Note: since everything else already ran, a full rollback
        // here is done manually. An alternative is to wrap the whole
        // handler in a transaction, but that would also wrap the
        // Stripe-less multi-step flow and complicate things. Given
        // the rarity, manual cleanup is acceptable.
        console.error(
          `[benefit] seat booking race: booked ${booked.length} of ${seatAssignments.length}`
        );

        // Delete the just-created tickets + order
        await db
          .delete(orderTickets)
          .where(eq(orderTickets.orderId, orderRow.id));
        await db.delete(orders).where(eq(orders.id, orderRow.id));

        return NextResponse.json(
          {
            error:
              "Your seat hold expired during checkout. Please select seats again.",
            code: "SEAT_EXPIRED",
          },
          { status: 409 }
        );
      }
    }

    // ==================================================
    // CREATE TICKETS
    // ==================================================
    const seatQueue = seatAssignments.map((s) => ({
      seatId: s.seatId,
      seatLabel: s.seatLabel,
    }));
    let seatIndex = 0;

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

        // ⭐ Attach a seat if this item belongs to the seated category
        let seatId: number | null = null;
        let seatLabel: string | null = null;
        if (
          seatAssignments.length > 0 &&
          item.categoryId === seatAssignments[0].categoryId
        ) {
          const slot = seatQueue[seatIndex];
          if (slot) {
            seatId = slot.seatId;
            seatLabel = slot.seatLabel;
            seatIndex++;
          }
        }

        await db.insert(orderTickets).values({
          orderId: orderRow.id,
          eventId,
          ticketTypeId: item.typeId,
          ticketNumber,
          qrCodeData: payload,
          isScanned: false,
          seatId,
          seatLabel,
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