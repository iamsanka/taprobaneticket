import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { raffles } from "./raffles";

/* ============================
   RAFFLE WINNERS
   ------------------------------------------------------------
   One row per winner. Snapshot pattern:
     - customerEmail and customerName are frozen at draw time.
       If the customer later changes their email on their account
       (or the order is edited), the raffle result stays valid.
     - orderId is a plain integer with no FK — same rationale as
       orders.eventId in this codebase. Application code keeps it
       consistent, but a deleted order won't cascade-wipe a
       historical raffle result.

   Position semantics:
     1  = top prize (first place) — highlighted in the podium
     2  = runner-up (second place)
     3  = third place
     N  = last picked

   The reveal animation shows them in reverse (N → 1) for drama,
   but they're always stored position-ascending so the podium can
   render top-down.

   Redraw behavior:
     The draw API deletes all rows for the raffle before inserting
     a fresh set. There's no history of past draws — the note in
     the UI warns the admin that redrawing discards the previous
     winners.
============================ */

export const raffleWinners = pgTable(
  "raffle_winners",
  {
    id: serial("id").primaryKey(),

    raffleId: integer("raffle_id")
      .notNull()
      .references(() => raffles.id, { onDelete: "cascade" }),

    // 1 = top prize. Unique per raffle.
    position: integer("position").notNull(),

    // Snapshot of the customer
    customerEmail: varchar("customer_email", { length: 255 }).notNull(),
    customerName: varchar("customer_name", { length: 255 }),

    // Snapshot of the source order (no FK, see header comment)
    orderId: integer("order_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // No two winners can share a position in the same raffle.
      // This is the integrity constraint the redraw transaction
      // relies on for atomic replacement.
      uniqueRafflePosition: unique(
        "unique_raffle_winners_raffle_position"
      ).on(table.raffleId, table.position),

      // Fast "load all winners for this raffle" query
      idxRaffle: index("idx_raffle_winners_raffle").on(table.raffleId),
    };
  }
);