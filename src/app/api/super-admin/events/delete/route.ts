export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

// ⭐ FIX: Cookie-based Super Admin auth (same as GET + EDIT routes)
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
    // ⭐ AUTH CHECK
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
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // ⭐ Permanent delete
    const result = await db
      .delete(events)
      .where(eq(events.id, Number(id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, deletedEvent: result[0] },
      { status: 200 }
    );
  } catch (err) {
    console.error("Event delete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
