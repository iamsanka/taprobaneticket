import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { discountCodes } from "@/db/schema/discountCodes";
import { discountCodeUses } from "@/db/schema/discountCodeUses";
import { events } from "@/db/schema/events";
import { users } from "@/db/schema/users";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

/* ======================================================
   Random code generator
   ------------------------------------------------------
   Uses an alphabet that avoids confusion when typed by hand:
     - No 0 / O  (both look like O)
     - No 1 / I / L  (all look like 1)
     - No 5 / S  (look similar at small sizes)
   That leaves 30 usable chars → 30^8 ≈ 6.5 × 10^11 combinations.
   With a UNIQUE constraint + retry, collisions are practically impossible.
   ====================================================== */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
const CODE_LENGTH = 8;

function generateRandomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// ======================================================
// GET /api/super-admin/discounts
// Optional filter: ?eventId=6
// ======================================================
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const eventIdRaw = req.nextUrl.searchParams.get("eventId");
    const eventId =
      eventIdRaw && eventIdRaw !== "all" && eventIdRaw !== ""
        ? Number(eventIdRaw)
        : null;

    const rows = await db
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
      })
      .from(discountCodes)
      .leftJoin(events, eq(discountCodes.eventId, events.id))
      .leftJoin(users, eq(discountCodes.createdBy, users.id))
      .where(
        eventId !== null && Number.isInteger(eventId)
          ? eq(discountCodes.eventId, eventId)
          : undefined
      )
      .orderBy(desc(discountCodes.id));

    // Enrich with remaining uses
    const enriched = rows.map((r) => ({
      ...r,
      remainingUses:
        r.maxUses === null ? null : Math.max(r.maxUses - r.usedCount, 0),
      isExhausted: r.maxUses !== null && r.usedCount >= r.maxUses,
    }));

    return NextResponse.json({ discounts: enriched });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("List discount codes error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// POST /api/super-admin/discounts
// Create a new discount code.
// Body:
//   { eventId: number,
//     percentage: number (1-100),
//     maxUses?: number | null,
//     expiresAt?: string | null (ISO date),
//     code?: string (optional — if omitted we generate a random one) }
// ======================================================
export async function POST(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN", "ADMIN"]);

    const body = await req.json();

    const eventIdRaw = body.eventId;
    const eventId =
      eventIdRaw === null || eventIdRaw === undefined || eventIdRaw === ""
        ? null
        : Number(eventIdRaw);

    const percentage = Number(body.percentage);
    const maxUsesRaw = body.maxUses;
    const maxUses =
      maxUsesRaw === null || maxUsesRaw === undefined || maxUsesRaw === ""
        ? null
        : Number(maxUsesRaw);

    const expiresAtRaw = body.expiresAt;
    const customCodeRaw = body.code;

    // ---- Validation ----
    if (eventId === null || !Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "eventId is required and must be a valid number" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(percentage) ||
      !Number.isInteger(percentage) ||
      percentage < 1 ||
      percentage > 100
    ) {
      return NextResponse.json(
        { error: "percentage must be an integer between 1 and 100" },
        { status: 400 }
      );
    }

    if (maxUses !== null) {
      if (
        !Number.isFinite(maxUses) ||
        !Number.isInteger(maxUses) ||
        maxUses < 1
      ) {
        return NextResponse.json(
          { error: "maxUses must be a positive integer or omitted for unlimited" },
          { status: 400 }
        );
      }
    }

    let expiresAt: Date | null = null;
    if (expiresAtRaw) {
      const d = new Date(expiresAtRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid expiresAt date" },
          { status: 400 }
        );
      }
      // Treat as end-of-day on the specified date
      d.setHours(23, 59, 59, 999);
      if (d.getTime() < Date.now()) {
        return NextResponse.json(
          { error: "expiresAt must be in the future" },
          { status: 400 }
        );
      }
      expiresAt = d;
    }

    // ---- Resolve the code string ----
    // If admin typed one, use it (validated). Otherwise generate random.
    // ⭐ isCustomCode controls whether we retry on collision or reject.
    let code: string;
    let isCustomCode = false;

    if (customCodeRaw && String(customCodeRaw).trim()) {
      code = String(customCodeRaw)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (code.length < 4 || code.length > 32) {
        return NextResponse.json(
          { error: "Custom code must be 4–32 characters (letters and digits)" },
          { status: 400 }
        );
      }
      isCustomCode = true;
    } else {
      code = generateRandomCode();
    }

    // ---- Confirm the event exists ----
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId));

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ---- Insert with retry on collision (up to 5 attempts) ----
    let created: typeof discountCodes.$inferSelect | null = null;
    let attempt = 0;
    const MAX_ATTEMPTS = 5;

    while (attempt < MAX_ATTEMPTS && !created) {
      try {
        const [row] = await db
          .insert(discountCodes)
          .values({
            eventId,
            code,
            percentage,
            maxUses,
            expiresAt,
            isActive: true,
            createdBy: session.userId,
          })
          .returning();
        created = row;
      } catch (err: any) {
        // Postgres unique violation on code (23505)
        if (err?.code === "23505") {
          // ⭐ Custom codes are never silently replaced — reject with 409.
          if (isCustomCode) {
            return NextResponse.json(
              {
                error: `Code "${code}" is already in use. Please choose a different one.`,
              },
              { status: 409 }
            );
          }
          // ⭐ Random codes retry with a fresh random value.
          if (attempt < MAX_ATTEMPTS - 1) {
            code = generateRandomCode();
            attempt++;
            continue;
          }
        }
        throw err;
      }
    }

    if (!created) {
      return NextResponse.json(
        { error: "Could not generate a unique code. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        discount: {
          ...created,
          remainingUses:
            created.maxUses === null
              ? null
              : created.maxUses - created.usedCount,
          isExhausted: false,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create discount code error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}