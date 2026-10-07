import { eq, and } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { ticketTypes } from "@/db/schema/ticketTypes";
import { eventTickets } from "@/db/schema/eventTickets";

export type ValidatedItem = {
  typeId: number;
  eventId: number;
  quantity: number;
  price: number; // from DB, authoritative
};

export type ValidateCartResult =
  | { ok: true; items: ValidatedItem[] }
  | { ok: false; error: string; code: "INVALID_CART" | "STALE_CART" };

export async function validateCart(
  cartItems: any[]
): Promise<ValidateCartResult> {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { ok: false, error: "Cart is empty", code: "INVALID_CART" };
  }

  const validated: ValidatedItem[] = [];

  for (const item of cartItems) {
    if (
      !Number.isInteger(item.typeId) ||
      !Number.isInteger(item.quantity) ||
      !Number.isInteger(item.eventId) ||
      item.quantity < 1
    ) {
      return { ok: false, error: "Invalid cart item", code: "INVALID_CART" };
    }

    const [ticketType] = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.id, item.typeId));

    if (!ticketType) {
      return {
        ok: false,
        error:
          "Your cart contains an expired ticket. Please clear your cart and add tickets again.",
        code: "STALE_CART",
      };
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
      return {
        ok: false,
        error:
          "Your cart contains a ticket that is no longer available for this event. Please clear your cart and add tickets again.",
        code: "STALE_CART",
      };
    }

    validated.push({
      typeId: item.typeId,
      eventId: item.eventId,
      quantity: item.quantity,
      price: eventTicket.price,
    });
  }

  return { ok: true, items: validated };
}