import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { orders } from "@/db/schema/orders";
import { orderTickets } from "@/db/schema/orderTickets";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const intentId = searchParams.get("id");

    if (!intentId) {
      return NextResponse.json({ error: "Missing payment_intent" }, { status: 400 });
    }

    // Get order
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, intentId));

    if (orderRows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderRows[0];

    // Get tickets
    const tickets = await db
      .select()
      .from(orderTickets)
      .where(eq(orderTickets.orderId, order.id));

    return NextResponse.json(
      {
        order,
        tickets,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Order fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
