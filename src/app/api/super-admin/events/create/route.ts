import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { events } from "@/db/schema/events";
import { eventTickets } from "@/db/schema/eventTickets";
import { eventSequences } from "@/db/schema/eventSequences";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

function getSuperAdmin(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET!) as {
      userId: number;
      role: string;
    };
    return decoded.role === "SUPER_ADMIN" ? decoded : null;
  } catch {
    return null;
  }
}

const SEQUENCE_CODE_REGEX = /^[a-z][a-z0-9]{3,31}$/;

export async function POST(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Super Admin only" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      description,
      eventTime,
      location,
      visibility,
      coverImage,
      galleryImages,
      eventTickets: tickets,
      sequenceCode: rawSequenceCode,
    } = body;

    // ---- Validate required fields ----
    if (!title || !description || !eventTime || !location) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ---- Validate sequence code ----
    const sequenceCode = String(rawSequenceCode || "").trim().toLowerCase();

    if (!sequenceCode) {
      return NextResponse.json(
        { error: "Sequence code is required" },
        { status: 400 }
      );
    }

    if (!SEQUENCE_CODE_REGEX.test(sequenceCode)) {
      return NextResponse.json(
        {
          error:
            "Sequence code must be 4–32 characters, start with a letter, and use only lowercase letters and digits.",
        },
        { status: 400 }
      );
    }

    // Pre-check uniqueness for a clean error message
    const existingSeq = await db
      .select({ id: eventSequences.id })
      .from(eventSequences)
      .where(eq(eventSequences.sequenceCode, sequenceCode));

    if (existingSeq.length > 0) {
      return NextResponse.json(
        { error: "This sequence code is already in use" },
        { status: 409 }
      );
    }

    // ---- Create event + sequence in a transaction ----
    // If either fails, both roll back. Prevents orphan events (event
    // created but sequence missing → checkout would fail later).
    const created = await db.transaction(async (tx) => {
      const [eventRow] = await tx
        .insert(events)
        .values({
          title,
          description,
          eventTime,
          location,
          visibility: visibility || "draft",
          coverImage: coverImage || null,
          galleryImages: galleryImages || [],
          createdBy: user.userId,
        })
        .returning();

      const eventId = eventRow.id;

      // Insert the sequence row immediately — checkout depends on it
      await tx.insert(eventSequences).values({
        eventId,
        sequenceCode,
      });

      // Insert event tickets
      if (Array.isArray(tickets)) {
        for (const t of tickets) {
          await tx.insert(eventTickets).values({
            eventId,
            categoryId: t.categoryId,
            typeId: t.typeId,
            price: Number(t.price),
            limit: Number(t.limit),
          });
        }
      }

      return eventRow;
    });

    return NextResponse.json(
      { success: true, event: created },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Event creation error:", err);

    // Catch unique constraint violation as a friendly message
    if (err?.code === "23505" || err?.code === "23505") {
      return NextResponse.json(
        { error: "This sequence code is already in use" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}