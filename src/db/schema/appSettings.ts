import {
  pgTable,
  integer,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Single-row settings table. Always has exactly one row with id = 1.
 * Seeded via migration on first run.
 */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),

  /** VAT rate as a percentage of gross. 13.5 means 13.5%. */
  vatRatePercent: numeric("vat_rate_percent", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("13.50"),

  /** WhatsApp number in international format, digits only (no +, no spaces). */
  whatsappNumber: text("whatsapp_number").notNull().default("358442363616"),

  /** Pretty display format shown to customers. */
  whatsappDisplay: text("whatsapp_display")
    .notNull()
    .default("+358 442363616"),

  /** Brand shown on PDFs, emails, and the benefit page. */
  brandName: text("brand_name").notNull().default("Taprobane Entertainment"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});