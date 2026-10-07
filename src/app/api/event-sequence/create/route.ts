import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { eventSequences } from "@/db/schema/eventSequences";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { eventId, sequenceCode } = body;

    if (!eventId || !sequenceCode) {
      return NextResponse.json(
        { error: "eventId and sequenceCode are required" },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(eventSequences)
      .values({
        eventId,
        sequenceCode,
      })
      .returning();

    return NextResponse.json(
      {
        message: "Sequence created successfully",
        sequence: row,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Sequence creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
