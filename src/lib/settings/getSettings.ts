import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { appSettings } from "@/db/schema/appSettings";

export type AppSettings = {
  /** e.g. 13.5 (percent) */
  vatRatePercent: number;
  /** e.g. 0.135 — the decimal multiplier to use in math */
  vatRateDecimal: number;
  /** e.g. "358442363616" — for wa.me URLs */
  whatsappNumber: string;
  /** e.g. "+358 442363616" — for display */
  whatsappDisplay: string;
  /** e.g. "Taprobane Entertainment" */
  brandName: string;
};

// ---- Fallbacks: used only if the DB row is missing for some reason ----
const FALLBACK: AppSettings = {
  vatRatePercent: 13.5,
  vatRateDecimal: 0.135,
  whatsappNumber: "358442363616",
  whatsappDisplay: "+358 442363616",
  brandName: "Taprobane Entertainment",
};

// ---- In-memory cache ----
// Settings change rarely; a small cache saves a DB round-trip on every
// email, PDF, or checkout request. Cache is invalidated by the settings
// PATCH endpoint after a save.
let cached: { settings: AppSettings; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute, just in case

/**
 * Reads the app settings row. Fast (cached for ~60s).
 * Falls back to hardcoded defaults if the row is missing.
 */
export async function getSettings(): Promise<AppSettings> {
  // Return from cache if fresh
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.settings;
  }

  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1));

    if (!row) {
      console.warn(
        "getSettings: no app_settings row found; using fallbacks. Run the seed migration."
      );
      return FALLBACK;
    }

    const vatRatePercent = Number(row.vatRatePercent ?? FALLBACK.vatRatePercent);

    const settings: AppSettings = {
      vatRatePercent,
      vatRateDecimal: vatRatePercent / 100,
      whatsappNumber: row.whatsappNumber || FALLBACK.whatsappNumber,
      whatsappDisplay: row.whatsappDisplay || FALLBACK.whatsappDisplay,
      brandName: row.brandName || FALLBACK.brandName,
    };

    cached = { settings, loadedAt: Date.now() };
    return settings;
  } catch (err) {
    console.error("getSettings: DB read failed; using fallbacks", err);
    return FALLBACK;
  }
}

/**
 * Clears the cache. Call this after saving settings via the API.
 */
export function invalidateSettingsCache(): void {
  cached = null;
}