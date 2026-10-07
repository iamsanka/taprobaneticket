import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { discountCodes } from "@/db/schema/discountCodes";
import { discountCodeUses } from "@/db/schema/discountCodeUses";
import { orders } from "@/db/schema/orders";
import { events } from "@/db/schema/events";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

// ======================================================
// GET /api/super-admin/discounts/[id]
// Returns the code + its full redemption history.
// ======================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const discountId = Number(id);

    if (!Number.isInteger(discountId) || discountId <= 0) {
      return NextResponse.json(
        { error: "Invalid discount id" },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({
        id: discountCodes.id,
        eventId: discountCodes.eventId,
        eventTitle: events.title,
        code: discountCodes.code,
        percentage: discountCodes.percentage,
        maxUses: discountCodes.maxUses,
        usedCount: discountCodes.usedCount,
        expiresAt: discountCodes.expiresAt,
        isActive: discountCodes.isActive,
        createdByEmail: users.email,
        createdAt: discountCodes.createdAt,
        updatedAt: discountCodes.updatedAt,
      })
      .from(discountCodes)
      .leftJoin(events, eq(discountCodes.eventId, events.id))
      .leftJoin(users, eq(discountCodes.createdBy, users.id))
      .where(eq(discountCodes.id, discountId));

    if (!row) {
      return NextResponse.json(
        { error: "Discount code not found" },
        { status: 404 }
      );
    }

    // ---- Fetch redemptions ----
    const uses = await db
      .select({
        id: discountCodeUses.id,
        orderId: discountCodeUses.orderId,
        orderNumber: orders.orderNumber,
        customerEmail: discountCodeUses.customerEmail,
        percentage: discountCodeUses.percentage,
        discountAmount: discountCodeUses.discountAmount,
        usedAt: discountCodeUses.usedAt,
      })
      .from(discountCodeUses)
      .leftJoin(orders, eq(discountCodeUses.orderId, orders.id))
      .where(eq(discountCodeUses.discountCodeId, discountId))
      .orderBy(asc(discountCodeUses.usedAt));

    return NextResponse.json({
      discount: {
        ...row,
        remainingUses:
          row.maxUses === null ? null : Math.max(row.maxUses - row.usedCount, 0),
        isExhausted: row.maxUses !== null && row.usedCount >= row.maxUses,
      },
      uses,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get discount code error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PATCH /api/super-admin/discounts/[id]
// Toggle isActive. The only editable field once created —
// percentage and code are immutable, and maxUses/expiresAt are
// locked too (changing them mid-flight could confuse customers).
// ======================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const { id } = await params;
    const discountId = Number(id);

    if (!Number.isInteger(discountId) || discountId <= 0) {
      return NextResponse.json(
        { error: "Invalid discount id" },
        { status: 400 }
      );
    }

    const body = await req.json();

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.id, discountId));

    if (!existing) {
      return NextResponse.json(
        { error: "Discount code not found" },
        { status: 404 }
      );
    }

    const [updated] = await db
      .update(discountCodes)
      .set({
        isActive: body.isActive,
        updatedAt: new Date(),
      })
      .where(eq(discountCodes.id, discountId))
      .returning();

    return NextResponse.json({
      discount: {
        ...updated,
        remainingUses:
          updated.maxUses === null
            ? null
            : Math.max(updated.maxUses - updated.usedCount, 0),
        isExhausted:
          updated.maxUses !== null && updated.usedCount >= updated.maxUses,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update discount code error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// DELETE /api/super-admin/discounts/[id]
// SUPER_ADMIN only. Cascades the uses table.
// Requires ?confirm=delete. Refuses if any orders have used it
// (so you don't lose the audit trail by accident).
// ======================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);

    const { id } = await params;
    const discountId = Number(id);

    if (!Number.isInteger(discountId) || discountId <= 0) {
      return NextResponse.json(
        { error: "Invalid discount id" },
        { status: 400 }
      );
    }

    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== "delete") {
      return NextResponse.json(
        {
          error:
            "Deletion requires ?confirm=delete query parameter to confirm.",
        },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.id, discountId));

    if (!existing) {
      return NextResponse.json(
        { error: "Discount code not found" },
        { status: 404 }
      );
    }

    // If anyone has used it, force the admin to just deactivate instead
    if (existing.usedCount > 0) {
      return NextResponse.json(
        {
          error: `This code has been used ${existing.usedCount} ${
            existing.usedCount === 1 ? "time" : "times"
          }. Deactivate it instead of deleting to preserve history.`,
        },
        { status: 400 }
      );
    }

    await db
      .delete(discountCodes)
      .where(eq(discountCodes.id, discountId));

    console.log(
      `Discount code deleted: user ${session.userId} deleted "${existing.code}" (id ${discountId})`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete discount code error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}