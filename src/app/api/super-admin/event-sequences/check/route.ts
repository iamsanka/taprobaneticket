import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
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

// Sequence code must be lowercase alphanumeric, start with a letter.
// e.g. "taprosa2026", "summerfest26"
export const SEQUENCE_CODE_REGEX = /^[a-z][a-z0-9]{3,31}$/;

export async function GET(req: NextRequest) {
  try {
    const user = getSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const raw = req.nextUrl.searchParams.get("code") || "";
    const code = raw.trim().toLowerCase();

    // ---- Format check ----
    if (!code) {
      return NextResponse.json({
        available: false,
        reason: "Sequence code is required",
      });
    }

    if (!SEQUENCE_CODE_REGEX.test(code)) {
      return NextResponse.json({
        available: false,
        reason:
          "Must be 4–32 characters, start with a letter, and use only lowercase letters and digits.",
      });
    }

    // ---- Uniqueness check ----
    const existing = await db
      .select({ id: eventSequences.id })
      .from(eventSequences)
      .where(eq(eventSequences.sequenceCode, code));

    if (existing.length > 0) {
      return NextResponse.json({
        available: false,
        reason: "This sequence code is already in use by another event.",
      });
    }

    return NextResponse.json({ available: true, code });
  } catch (err) {
    console.error("Sequence check error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}