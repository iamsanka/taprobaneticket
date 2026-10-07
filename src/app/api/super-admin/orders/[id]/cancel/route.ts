import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { orders } from "@/db/schema/orders";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

// Orders in these statuses can be cancelled by an admin.
// Paid orders CANNOT be cancelled here — that requires a refund flow.
const CANCELLABLE_STATUSES = ["pending_benefit", "pending"];

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

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        {
          error: `Cannot cancel an order with status "${order.status}". Only unpaid orders can be cancelled here.`,
        },
        { status: 400 }
      );
    }

    if (order.paidAt) {
      // Belt and braces — paidAt should be null for cancellable statuses,
      // but we double-check to avoid cancelling a paid order by accident.
      return NextResponse.json(
        { error: "Cannot cancel an order that has been paid" },
        { status: 400 }
      );
    }

    await db
      .update(orders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    console.log(
      `Cancel order: user ${session.userId} cancelled order ${order.orderNumber}`
    );

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Cancel order error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}