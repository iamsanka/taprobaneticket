import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { ticketCategories } from "@/db/schema/ticketCategories";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// 🔐 Super Admin Auth
function getSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };

    if (decoded.role !== "SUPER_ADMIN") return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Ticket category ID is required" },
        { status: 400 }
      );
    }

    // ⭐ Delete category (ticket types auto-delete via cascade)
    const result = await db
      .delete(ticketCategories)
      .where(eq(ticketCategories.id, id))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Ticket category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, deletedCategory: result[0] },
      { status: 200 }
    );
  } catch (err) {
    console.error("Ticket category delete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
