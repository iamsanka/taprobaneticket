import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { seatingMaps } from "./seatingMaps";

/* ============================
   SEATING SECTIONS
   ------------------------------------------------------------
   Each seating map owns 1..N sections.

   Two supported shapes (both flow through this same table):

     QUICK SETUP (small venue):
       One section labeled "Main" with rows=8, colsPerRow=20.
       The UI hides the "Main-" prefix everywhere, so the customer
       sees seats A1..H20.

     MULTI-SECTION (large venue):
       Three sections: "Left", "Center", "Right", each with its
       own rows × colsPerRow. Customer sees Left-A1, Center-A1,
       Right-A1, etc.

   Conventions:
     - `rows` is the number of seat rows. Row letters are derived:
       A=1, B=2, ..., Z=26, AA=27, AB=28 ... (spreadsheet-style).
     - `colsPerRow` is the number of seats in each row.
       v1: same count for every row in a section (not per-row custom).
     - Seats themselves live in the `seats` table, generated on
       section create/update. This table is just the blueprint.
============================ */

export const seatingSections = pgTable(
  "seating_sections",
  {
    id: serial("id").primaryKey(),

    mapId: integer("map_id")
      .notNull()
      .references(() => seatingMaps.id, { onDelete: "cascade" }),

    // Human label shown in admin + customer UI.
    // Examples: "Main", "Left", "Center", "Right", "Upper Balcony".
    // Customer-facing seat label becomes "<label>-<rowLetter><number>",
    // except when label === "Main" (the prefix is hidden).
    label: varchar("label", { length: 64 }).notNull(),

    // Grid dimensions. Both >= 1.
    // v1 caps: rows <= 200, colsPerRow <= 200 (enforced at API level,
    // not in the schema, so we can raise it without a migration).
    rows: integer("rows").notNull(),
    colsPerRow: integer("cols_per_row").notNull(),

    // Rendering order — lower number = further left / rendered first.
    // Admin can drag-reorder sections; gaps in the sequence are fine.
    displayOrder: integer("display_order").notNull().default(0),

    // Optional hex color for the admin editor (e.g. "#4fb6e0").
    // NULL = use the default palette entry based on displayOrder.
    // 7 chars: "#RRGGBB"
    colorHex: varchar("color_hex", { length: 7 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // No two sections in the same map can share a label —
      // otherwise the seat-label prefix would collide.
      uniqueMapLabel: unique("unique_seating_sections_map_label").on(
        table.mapId,
        table.label
      ),
      // Fast "load all sections for this map, in order" query
      idxMap: index("idx_seating_sections_map").on(table.mapId),
    };
  }
);