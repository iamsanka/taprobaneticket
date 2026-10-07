import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { events } from "@/db/schema/events";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        totalPrice: orders.totalPrice,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        status: orders.status,
        eventTitle: events.title,
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(eq(orders.status, "pending_benefit"))
      .orderBy(desc(orders.id));

    return NextResponse.json({ orders: rows });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Pending benefit orders error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}