import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { ticketCategories } from "./ticketCategories";
import { users } from "./users";

/* ============================
   SEATING MAPS
   ------------------------------------------------------------
   One map per (event, category) pair.
   Rationale: a category like "Balcony" is global, but the physical
   layout varies per event (different venues). So the map is scoped
   to the pair, not to either one alone.

   A map owns 1..N sections (see seatingSections.ts), and each
   section owns N seats (see seats.ts).

   Deleting the event or the category cascades the map away.
   The createdBy user is protected by RESTRICT (audit trail).
============================ */

export const seatingMaps = pgTable(
  "seating_maps",
  {
    id: serial("id").primaryKey(),

    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    categoryId: integer("category_id")
      .notNull()
      .references(() => ticketCategories.id, { onDelete: "cascade" }),

    // Friendly label shown in the admin, e.g. "Main Hall", "Upper Balcony"
    name: varchar("name", { length: 128 }).notNull(),

    // ⭐ NEW — Where the stage / screen is relative to the audience.
    // Values: "top" | "bottom" | "none"
    // Rendered as a STAGE banner on the customer's seat picker
    // so they understand which way to face.
    stagePosition: varchar("stage_position", { length: 10 })
      .default("top")
      .notNull(),

    // Audit — who created this map
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
      // Exactly one map per (event, category) pair.
      // Admin must delete the existing map before creating a new one.
      uniqueEventCategory: unique("unique_seating_maps_event_category").on(
        table.eventId,
        table.categoryId
      ),
      // Fast "does this event have any seating maps?" lookups
      idxEvent: index("idx_seating_maps_event").on(table.eventId),
      // Fast "which events use this category's layout?" lookups
      idxCategory: index("idx_seating_maps_category").on(table.categoryId),
    };
  }
);