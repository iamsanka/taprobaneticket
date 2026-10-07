import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { finalizeOrder } from "@/lib/orders/finalizeOrder";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.paidAt) {
      return NextResponse.json(
        { error: "Cannot resend — order has not been paid" },
        { status: 400 }
      );
    }

    console.log(
      `Resend email: user ${session.userId} resending for order ${order.orderNumber}`
    );

    const result = await finalizeOrder(orderId, { forceResend: true });

    if (!result.ok) {
      if (result.reason === "not_paid") {
        return NextResponse.json(
          { error: "Order has not been paid" },
          { status: 400 }
        );
      }
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      console.error("finalizeOrder resend failed:", result);
      return NextResponse.json(
        { error: "Failed to resend email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderNumber: result.orderNumber,
      ticketCount: result.ticketCount,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Resend email error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}