import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";

/* ============================
   RAFFLES
   ------------------------------------------------------------
   One row per raffle. A single event can host many raffles.

   Lifecycle:
     draft  → created by SUPER_ADMIN, not yet drawn
     drawn  → winners have been picked (see raffle_winners)

   The winners themselves are stored in raffle_winners. The
   `status` field exists so the UI can show "Draw Winners"
   vs "Reveal Again" without a join.

   Roles:
     - Create: SUPER_ADMIN only
     - Draw / view / redraw: SUPER_ADMIN + ADMIN
     - Delete: SUPER_ADMIN only

   Cascade rules:
     - Deleting the event wipes its raffles (and their winners)
     - createdBy is RESTRICT (audit — don't lose the creator)
     - drawnBy is SET NULL (may be deleted, but raffle survives)
============================ */

export const raffles = pgTable(
  "raffles",
  {
    id: serial("id").primaryKey(),

    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    // Human label. e.g. "Grand Prize Draw", "Opening Night Raffle".
    name: varchar("name", { length: 128 }).notNull(),

    // How many winners the admin wants. Capped at draw time by the
    // actual pool size (distinct paid customers for the event).
    winnerCount: integer("winner_count").notNull(),

    // 'draft' | 'drawn'
    status: varchar("status", { length: 20 }).notNull().default("draft"),

    // Set when the draw runs. Updated on every redraw.
    drawnAt: timestamp("drawn_at", { withTimezone: true }),
    drawnBy: integer("drawn_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Who created the raffle. Kept for audit.
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // Fast "list raffles for this event" query
      idxEvent: index("idx_raffles_event").on(table.eventId),
    };
  }
);