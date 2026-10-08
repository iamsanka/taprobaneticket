import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { seatingMaps } from "./seatingMaps";
import { seatingSections } from "./seatingSections";

/* ============================
   SEATS
   ------------------------------------------------------------
   One row per physical seat.

   Three possible states (evaluated at read/claim time, lazily):

     AVAILABLE  → bookedOrderId IS NULL
                  AND (holdExpiresAt IS NULL OR holdExpiresAt < now())
                  AND isBlocked = false

     HELD       → bookedOrderId IS NULL
                  AND holdExpiresAt > now()
                  AND heldByToken IS NOT NULL

     BOOKED     → bookedOrderId IS NOT NULL

   isBlocked is orthogonal — a blocked seat is never claimable
   regardless of the other fields. (Admin flagged it as unusable:
   obstructed view, broken chair, aisle, etc.)

   No cron job is used. Expired holds simply fail the
   `holdExpiresAt > now()` predicate on the next read/claim, which
   transitions the seat back to AVAILABLE automatically.

   Concurrency:
     Claiming is done with a single conditional UPDATE that only
     succeeds if the seat is AVAILABLE (or already held by this
     same token, which is a no-op re-claim). Postgres row-locks
     ensure exactly one concurrent claim wins.

   bookedOrderId is a plain integer (no FK) — mirrors the
   `orders.event_id` convention in this codebase, and avoids
   cascade surprises when an order is deleted. Application code
   is responsible for consistency: cancel-order must set it back
   to NULL along with clearing any held* fields.
============================ */

export const seats = pgTable(
  "seats",
  {
    id: serial("id").primaryKey(),

    sectionId: integer("section_id")
      .notNull()
      .references(() => seatingSections.id, { onDelete: "cascade" }),

    // Denormalized for fast map-wide queries without a join to sections.
    // Safe because a section never moves between maps after creation.
    mapId: integer("map_id")
      .notNull()
      .references(() => seatingMaps.id, { onDelete: "cascade" }),

    // Row letter: "A", "B", ..., "Z", "AA", "AB" ... varchar(4) covers
    // up to "ZZZZ" which is way beyond any real venue.
    rowLabel: varchar("row_label", { length: 4 }).notNull(),

    // 1-based numeric sort key for the row. "A"=1, "B"=2, ..., "AA"=27.
    // Kept separate from rowLabel so ORDER BY is a cheap integer sort.
    rowOrder: integer("row_order").notNull(),

    // 1..colsPerRow. Numbers are always sequential in v1; if you ever
    // need "skip 13" or "1, 3, 5", we add a config in the API layer
    // (the DB is already flexible here).
    numberLabel: integer("number_label").notNull(),

    // Admin can mark a seat as unusable. Never bookable, never holdable.
    isBlocked: boolean("is_blocked").notNull().default(false),

    // Set when the customer's payment is confirmed. Cleared on cancel.
    // No FK — see header comment.
    bookedOrderId: integer("booked_order_id"),

    // Random 32-char token the server returns to the browser when a
    // hold is claimed. Browser sends it back on release/extend/book.
    // Never trust a client-supplied token over a DB lookup.
    heldByToken: varchar("held_by_token", { length: 64 }),

    // When the current hold expires. NULL = no active hold.
    // Application sets: 5 min on initial hold, 30 min on PI creation.
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // No two seats in the same section can share a coordinate.
      // This is the physical-truth constraint — nothing else enforces it.
      uniqueCoord: unique("unique_seats_section_row_number").on(
        table.sectionId,
        table.rowLabel,
        table.numberLabel
      ),

      // Hot path — "all seats for this map, is each one available?".
      // Composite because we may later add a background sweeper that
      // queries "expired holds on this map". Leftmost prefix (mapId)
      // also serves map-only lookups efficiently.
      idxMapHold: index("idx_seats_map_hold").on(
        table.mapId,
        table.holdExpiresAt
      ),

      // Release / extend: "which seats does this token currently hold?"
      idxHoldToken: index("idx_seats_hold_token").on(table.heldByToken),

      // Order detail + cancel: "which seats belong to this order?"
      idxBookedOrder: index("idx_seats_booked_order").on(
        table.bookedOrderId
      ),
    };
  }
);