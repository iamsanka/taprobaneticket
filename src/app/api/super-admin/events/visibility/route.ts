import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eq } from "drizzle-orm";

// 🔐 Only Super Admin can change event visibility
async function isSuperAdmin() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/session`, {
      cache: "no-store",
    });
    const data = await res.json();
    return data.loggedIn && data.role === "SUPER_ADMIN" ? data : null;
  } catch {
    return null;
  }
}

export async function PUT(req: Request) {
  try {
    const user = await isSuperAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    const { id, visibility } = await req.json();

    if (!id || !visibility) {
      return NextResponse.json(
        { error: "Event ID and visibility are required" },
        { status: 400 }
      );
    }

    const validStates = ["public", "hidden", "draft"];
    if (!validStates.includes(visibility)) {
      return NextResponse.json(
        { error: "Invalid visibility state" },
        { status: 400 }
      );
    }

    const result = await db
      .update(events)
      .set({
        visibility,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, event: result[0] },
      { status: 200 }
    );
  } catch (err) {
    console.error("Event visibility update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
