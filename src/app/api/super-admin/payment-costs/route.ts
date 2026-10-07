import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { paymentMethodCosts } from "@/db/schema/paymentMethodCosts";
import { getSession, AuthError } from "@/lib/auth/getSession";

export const runtime = "nodejs";

const VALID_METHODS = ["card", "epassi", "edenred"] as const;
type PaymentMethod = (typeof VALID_METHODS)[number];

const VALID_MODES = ["percentage_plus_fixed", "percentage_or_fixed"] as const;
type CostMode = (typeof VALID_MODES)[number];

// ======================================================
// GET /api/super-admin/payment-costs
// Returns all rows (one per method)
// ======================================================
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN", "ADMIN", "AUDIT"]);

    const rows = await db
      .select()
      .from(paymentMethodCosts)
      .orderBy(paymentMethodCosts.method);

    return NextResponse.json({ costs: rows });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get payment costs error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PUT /api/super-admin/payment-costs?method=card
// Update one method's cost config
// ======================================================
export async function PUT(req: NextRequest) {
  try {
    const session = getSession(req, ["SUPER_ADMIN"]);

    const method = (req.nextUrl.searchParams.get("method") || "")
      .trim()
      .toLowerCase() as PaymentMethod;

    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json(
        { error: `Invalid method. Must be one of: ${VALID_METHODS.join(", ")}` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const mode = String(body.mode ?? "") as CostMode;

    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    // ---- percentageBps ----
    const percentageBps = Number(body.percentageBps);
    if (
      !Number.isFinite(percentageBps) ||
      !Number.isInteger(percentageBps) ||
      percentageBps < 0 ||
      percentageBps > 10000
    ) {
      return NextResponse.json(
        { error: "percentageBps must be an integer between 0 and 10000" },
        { status: 400 }
      );
    }

    // ---- fixedAmount ----
    const fixedAmount = Number(body.fixedAmount);
    if (
      !Number.isFinite(fixedAmount) ||
      !Number.isInteger(fixedAmount) ||
      fixedAmount < 0
    ) {
      return NextResponse.json(
        { error: "fixedAmount must be a non-negative integer (cents)" },
        { status: 400 }
      );
    }

    // ---- isActive ----
    const isActive =
      body.isActive === undefined ? true : Boolean(body.isActive);

    // ---- Upsert ----
    // There should already be one row per method (from the seed), but
    // the upsert makes this idempotent if the row is missing.
    const existing = await db
      .select()
      .from(paymentMethodCosts)
      .where(eq(paymentMethodCosts.method, method));

    let row;
    if (existing.length === 0) {
      const [created] = await db
        .insert(paymentMethodCosts)
        .values({
          method,
          mode,
          percentageBps,
          fixedAmount,
          isActive,
          updatedBy: session.userId,
        })
        .returning();
      row = created;
    } else {
      const [updated] = await db
        .update(paymentMethodCosts)
        .set({
          mode,
          percentageBps,
          fixedAmount,
          isActive,
          updatedBy: session.userId,
          updatedAt: new Date(),
        })
        .where(eq(paymentMethodCosts.method, method))
        .returning();
      row = updated;
    }

    return NextResponse.json({ cost: row });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update payment cost error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}