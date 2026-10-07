import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { appSettings } from "@/db/schema/appSettings";

export const runtime = "nodejs";

// ---- Fallbacks: same values as the seed defaults ----
const FALLBACK = {
  whatsappNumber: "358442363616",
  whatsappDisplay: "+358 442363616",
  brandName: "Taprobane Entertainment",
};

/**
 * Public settings — safe for any visitor to see.
 * Used by customer-facing pages (benefit payment instructions).
 *
 * Deliberately EXCLUDES:
 *   - vatRatePercent  (internal financial data)
 *   - id / updatedAt  (not needed by clients)
 */
export async function GET() {
  try {
    const [row] = await db
      .select({
        whatsappNumber: appSettings.whatsappNumber,
        whatsappDisplay: appSettings.whatsappDisplay,
        brandName: appSettings.brandName,
      })
      .from(appSettings)
      .where(eq(appSettings.id, 1));

    if (!row) {
      return NextResponse.json({ settings: FALLBACK });
    }

    return NextResponse.json({ settings: row });
  } catch (err) {
    console.error("Public settings error:", err);
    // Never fail the customer-facing page — return fallbacks.
    return NextResponse.json({ settings: FALLBACK });
  }
}