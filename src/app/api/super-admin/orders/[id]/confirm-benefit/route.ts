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

    if (order.status !== "pending_benefit") {
      return NextResponse.json(
        {
          error: `Order is not pending a benefit confirmation (current status: ${order.status})`,
        },
        { status: 400 }
      );
    }

    console.log(
      `Confirm benefit: user ${session.userId} confirming order ${order.orderNumber}`
    );

    const result = await finalizeOrder(orderId);

    if (!result.ok) {
      if (result.reason === "already_finalized") {
        return NextResponse.json(
          { error: "Order has already been finalized" },
          { status: 409 }
        );
      }
      console.error("finalizeOrder failed:", result.error);
      return NextResponse.json(
        { error: "Failed to finalize order" },
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
    console.error("Confirm benefit error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}