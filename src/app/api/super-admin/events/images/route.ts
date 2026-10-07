import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eq } from "drizzle-orm";

// 🔐 Only Super Admin can upload event images
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

export async function POST(req: Request) {
  try {
    const user = await isSuperAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const eventId = formData.get("eventId");
    const file = formData.get("file") as File;

    if (!eventId || !file) {
      return NextResponse.json(
        { error: "eventId and file are required" },
        { status: 400 }
      );
    }

    // Check if event exists
    const eventExists = await db
      .select()
      .from(events)
      .where(eq(events.id, Number(eventId)));

    if (eventExists.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Save file locally (dev mode)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "events");
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    const imageUrl = `/uploads/events/${fileName}`;

    // Update event cover image
    const updated = await db
      .update(events)
      .set({
        coverImage: imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(events.id, Number(eventId)))
      .returning();

    return NextResponse.json(
      { success: true, imageUrl, event: updated[0] },
      { status: 200 }
    );
  } catch (err) {
    console.error("Image upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
