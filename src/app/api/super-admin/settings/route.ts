import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/schema/index";
import { appSettings } from "@/db/schema/appSettings";
import { getSession, AuthError } from "@/lib/auth/getSession";
import { invalidateSettingsCache } from "@/lib/settings/getSettings";

export const runtime = "nodejs";

// ======================================================
// GET /api/super-admin/settings
// Returns the current settings row.
// ======================================================
export async function GET(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN"]);

    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1));

    if (!row) {
      // Auto-heal: insert the default row on first read if it's missing.
      const [created] = await db
        .insert(appSettings)
        .values({ id: 1 })
        .returning();

      return NextResponse.json({ settings: created });
    }

    return NextResponse.json({ settings: row });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Get settings error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ======================================================
// PATCH /api/super-admin/settings
// Validates + updates the settings row.
// ======================================================
export async function PATCH(req: NextRequest) {
  try {
    getSession(req, ["SUPER_ADMIN"]);

    const body = await req.json();

    // ---- Build an updates object with only provided fields ----
    const updates: Record<string, string | Date> = {};

    // ---- VAT rate ----
    if (body.vatRatePercent !== undefined) {
      // Be lenient about what the user pastes:
      //   20      → 20
      //   20.0    → 20.0
      //   20.00   → 20.00
      //   20%     → 20
      //   20.0%   → 20.0
      //   20,5    → 20.5   (European decimal separator)
      //   20 %    → 20
      const raw = String(body.vatRatePercent)
        .trim()
        .replace(/%/g, "")
        .replace(/,/g, ".")
        .trim();

      if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) {
        return NextResponse.json(
          {
            error:
              "VAT rate must be a number between 0 and 100 with up to 2 decimal places (e.g. 13.5 or 24.00)",
          },
          { status: 400 }
        );
      }

      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: "VAT rate must be between 0 and 100" },
          { status: 400 }
        );
      }

      // Store with 2 decimals for consistency: "13.50"
      updates.vatRatePercent = n.toFixed(2);
    }

    // ---- WhatsApp number (digits only) ----
    if (body.whatsappNumber !== undefined) {
      const raw = String(body.whatsappNumber).trim().replace(/\D/g, "");

      if (raw.length < 8 || raw.length > 15) {
        return NextResponse.json(
          {
            error:
              "WhatsApp number must be 8–15 digits, including the country code (no + or spaces)",
          },
          { status: 400 }
        );
      }

      updates.whatsappNumber = raw;
    }

    // ---- WhatsApp display ----
    if (body.whatsappDisplay !== undefined) {
      const raw = String(body.whatsappDisplay).trim();

      if (!raw || raw.length > 30) {
        return NextResponse.json(
          { error: "Display format must be 1–30 characters" },
          { status: 400 }
        );
      }

      updates.whatsappDisplay = raw;
    }

    // ---- Brand name ----
    if (body.brandName !== undefined) {
      const raw = String(body.brandName).trim();

      if (!raw || raw.length > 100) {
        return NextResponse.json(
          { error: "Brand name must be 1–100 characters" },
          { status: 400 }
        );
      }

      updates.brandName = raw;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date();

    // ---- Ensure the row exists, then update ----
    // Upsert pattern: try to update; if 0 rows affected, insert.
    const updated = await db
      .update(appSettings)
      .set(updates)
      .where(eq(appSettings.id, 1))
      .returning();

    let finalRow;
    if (updated.length === 0) {
      const [created] = await db
        .insert(appSettings)
        .values({ id: 1, ...updates })
        .returning();
      finalRow = created;
    } else {
      finalRow = updated[0];
    }

    // ---- Bust the server-side cache so the next read sees new values ----
    invalidateSettingsCache();

    return NextResponse.json({ settings: finalRow });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update settings error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}