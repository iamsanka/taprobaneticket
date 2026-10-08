import { NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ⭐ Hold extension when the customer commits to paying
const PAYMENT_HOLD_DURATION_MS = 30 * 60 * 1000; // 30 min

/* ======================================================
   Apply a discount code to an amount.
   Returns the discount in cents (rounded down) and the
   final amount after discount.
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
      discountCode: rawDiscountCode,
      // ⭐ NEW — seat hold validation
      seatToken: rawSeatToken,
      seatIds: rawSeatIds,
    } = body;

    const eventId = cartItems?.[0]?.eventId;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId missing from cart items" },
        { status: 400 }
      );
    }

    // ==================================================
    // 1. VALIDATE CART ITEMS (server-side, before any writes)
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

    // ==================================================
    // 2. VALIDATE + EXTEND SEAT HOLDS (if provided)
    // ==================================================
    // Rules:
    //   - seatIds + seatToken must be provided together
    //   - All seatIds must belong to a single seating map for
    //     (eventId, some category), and that category must match
    //     the categories of the items being purchased
    //   - Every seat must currently be held by this token
    //     and not expired/booked/blocked
    //   - Total seats must equal the sum of quantities for the
    //     seated category in this order
    //   - On success, extend the hold to 30 min so the customer
    //     has time to complete payment
    //
    // ⚠️ We do NOT mark seats as booked here. Booking happens in
    //    the Stripe webhook (payment_intent.succeeded). If the PI
    //    is created but never paid, the seats fall back to
    //    available when the 30-min hold expires.
    //
    // v1 constraint: only ONE seated category per order. Enforced
    // here (and mirrored on the client, File 40).
    // ==================================================
    let seatAssignments: Array<{ seatId: number; seatLabel: string; categoryId: number }> = [];
    let extendedSeatExpiry: Date | null = null;

    const hasSeats =
      Array.isArray(rawSeatIds) && rawSeatIds.length > 0;

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

      // Normalize seat IDs
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

      // Fetch all seats
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

      // All seats must be on the same map
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

      // The map must be for the same event as the cart
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

      // Count expected seats for the seated category in this cart
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

      // Every seat must be currently held by this token, unexpired,
      // unbooked, unblocked.
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

      // Extend the hold to 30 min so the customer can pay in peace.
      // (Runs inside the big transaction below to stay atomic with
      // ticket creation.)
      extendedSeatExpiry = new Date(
        now.getTime() + PAYMENT_HOLD_DURATION_MS
      );

      // Fetch seat labels for snapshotting into order_tickets
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

      // Same "hide Main prefix" rule as elsewhere
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
    // 3. SERVER-SIDE DISCOUNT VALIDATION
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
    // 4. EVENT SEQUENCE CODE
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
    // 5. ORDER NUMBER GENERATION
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
    // 6. STRIPE PAYMENT INTENT
    // ==================================================
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
        // ⭐ Snapshot the seat hold so the webhook can find them
        ...(hasSeats
          ? {
              seatToken: rawSeatToken as string,
              seatIds: (rawSeatIds as number[]).join(","),
            }
          : {}),
      },
    });

    // ==================================================
    // 7. ATOMIC WRITE: order + discount use + tickets + seat extension
    // ==================================================
    // Everything after this point runs in a transaction. If ticket
    // creation fails, the order and discount-use rows roll back too.
    // The Stripe PI is already created — if we roll back here, the PI
    // is orphaned (still valid, never charged). That's acceptable —
    // Stripe expires unpaid PIs after 24h, no money moves.
    const result = await db.transaction(async (tx) => {
      // 7a. Order
      const [orderRow] = await tx
        .insert(orders)
        .values({
          eventId,
          sequenceCode,
          orderNumber,
          customerName,
          customerEmail,
          customerPhone,
          totalPrice: finalAmount,
          stripePaymentIntentId: paymentIntent.id,
          status: "pending",
          discountCode: discountCodeString,
          discountAmount: discountAmount > 0 ? discountAmount : null,
        })
        .returning();

      // 7b. Discount use audit row
      if (discountId !== null && discountCodeString !== null) {
        await tx.insert(discountCodeUses).values({
          discountCodeId: discountId,
          orderId: orderRow.id,
          code: discountCodeString,
          customerEmail,
          percentage: discountPercentage,
          discountAmount,
        });
      }

      // 7c. Extend seat hold to 30 min
      // Only the seats in our hold — the WHERE clause protects against
      // racing with the expiry sweeper (there isn't one, but be safe).
      if (hasSeats && extendedSeatExpiry) {
        await tx
          .update(seats)
          .set({
            holdExpiresAt: extendedSeatExpiry,
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
          );
      }

      // 7d. Tickets
      // Seat assignment: for the seated category, one seat per ticket.
      // GA tickets get NULL seatId / seatLabel.
      //
      // We build a queue of seats for the seated category and pop one
      // per ticket. Since v1 supports only ONE seated category per
      // order, this is straightforward.
      const seatQueue = seatAssignments.map((s) => ({
        seatId: s.seatId,
        seatLabel: s.seatLabel,
      }));

      let seatIndex = 0;

      for (const item of validatedItems) {
        for (let i = 0; i < item.quantity; i++) {
          const [ticketSeq] = await tx
            .select()
            .from(ticketSequence)
            .where(eq(ticketSequence.eventId, eventId));

          const ticketNo = ticketSeq?.nextTicketNo || 1;
          const ticketNoFormatted = ticketNo.toString().padStart(4, "0");

          if (ticketSeq) {
            await tx
              .update(ticketSequence)
              .set({ nextTicketNo: ticketNo + 1 })
              .where(eq(ticketSequence.eventId, eventId));
          } else {
            await tx
              .insert(ticketSequence)
              .values({ eventId, nextTicketNo: 2 });
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
          if (item.categoryId === seatAssignments[0]?.categoryId) {
            const slot = seatQueue[seatIndex];
            if (slot) {
              seatId = slot.seatId;
              seatLabel = slot.seatLabel;
              seatIndex++;
            }
          }

          await tx.insert(orderTickets).values({
            orderId: orderRow.id,
            eventId,
            ticketTypeId: item.typeId,
            ticketNumber,
            qrCodeData: payload,
            isScanned: false,
            seatId,     // ⭐ nullable
            seatLabel,  // ⭐ nullable
          });
        }
      }

      // Sanity: every seat should have been assigned exactly once
      if (hasSeats && seatIndex !== seatQueue.length) {
        throw new Error(
          `Seat assignment mismatch: ${seatIndex} assigned, ${seatQueue.length} expected`
        );
      }

      return { orderRow };
    });

    const orderRow = result.orderRow;

    // ==================================================
    // 8. RESPONSE
    // ==================================================
    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret,
        orderId: orderRow.id,
        subtotal,
        discountAmount,
        finalAmount,
        // ⭐ Report the new hold expiry so the client can update its timer
        ...(extendedSeatExpiry
          ? { seatHoldExpiresAt: extendedSeatExpiry.toISOString() }
          : {}),
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