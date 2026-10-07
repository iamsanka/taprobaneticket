import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { discountCodes } from "@/db/schema/discountCodes";

export const runtime = "nodejs";

/* ======================================================
   PUBLIC endpoint — no auth required.
   ------------------------------------------------------
   Called by the checkout page when the customer clicks "Apply".
   Deliberately returns MINIMAL info:
     - Whether the code is valid
     - The percentage (so we can compute the discount)
     - A human-readable message for the customer
   It does NOT return: id, maxUses, usedCount, createdBy,
   other customers, etc. Those are admin-only.
   ====================================================== */

type ValidateBody = {
  code?: unknown;
  eventId?: unknown;
};

type ValidateResponse =
  | {
      valid: true;
      code: string;
      percentage: number;
      message: string;
    }
  | {
      valid: false;
      code?: string;
      message: string;
    };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ValidateBody;

    const rawCode = String(body.code ?? "").trim().toUpperCase();
    const eventIdRaw = body.eventId;
    const eventId =
      eventIdRaw === null || eventIdRaw === undefined || eventIdRaw === ""
        ? null
        : Number(eventIdRaw);

    // ---- Validation ----
    if (!rawCode) {
      return NextResponse.json<ValidateResponse>(
        { valid: false, message: "Enter a code" },
        { status: 200 }
      );
    }

    if (!eventId || !Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json<ValidateResponse>(
        { valid: false, message: "Missing event context" },
        { status: 200 }
      );
    }

    // ---- Look up the code ----
    const [row] = await db
      .select({
        id: discountCodes.id,
        eventId: discountCodes.eventId,
        code: discountCodes.code,
        percentage: discountCodes.percentage,
        maxUses: discountCodes.maxUses,
        usedCount: discountCodes.usedCount,
        expiresAt: discountCodes.expiresAt,
        isActive: discountCodes.isActive,
      })
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, rawCode),
          eq(discountCodes.eventId, eventId)
        )
      );

    // ---- Not found ----
    if (!row) {
      return NextResponse.json<ValidateResponse>(
        {
          valid: false,
          code: rawCode,
          message: "This code is not valid for this event",
        },
        { status: 200 }
      );
    }

    // ---- Inactive (paused by admin) ----
    if (!row.isActive) {
      return NextResponse.json<ValidateResponse>(
        {
          valid: false,
          code: rawCode,
          message: "This code is no longer active",
        },
        { status: 200 }
      );
    }

    // ---- Expired ----
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      return NextResponse.json<ValidateResponse>(
        {
          valid: false,
          code: rawCode,
          message: "This code has expired",
        },
        { status: 200 }
      );
    }

    // ---- Exhausted ----
    if (row.maxUses !== null && row.usedCount >= row.maxUses) {
      return NextResponse.json<ValidateResponse>(
        {
          valid: false,
          code: rawCode,
          message: "This code has reached its usage limit",
        },
        { status: 200 }
      );
    }

    // ---- All checks passed ----
    return NextResponse.json<ValidateResponse>(
      {
        valid: true,
        code: row.code,
        percentage: row.percentage,
        message: `${row.percentage}% discount applied`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Validate discount code error:", err);
    return NextResponse.json<ValidateResponse>(
      { valid: false, message: "Could not validate code" },
      { status: 500 }
    );
  }
}