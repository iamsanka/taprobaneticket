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
import { events } from "./events";
import { users } from "./users";

/* ============================
   DISCOUNT CODES
============================ */

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: serial("id").primaryKey(),

    // Every code belongs to exactly one event
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    // The string the customer types. Stored uppercase, unique globally.
    // 8 chars from a confusion-free alphabet (see generateCode helper).
    code: varchar("code", { length: 32 }).notNull(),

    // Percentage off, 1–100. Intentionally not 0 (pointless) and not >100.
    percentage: integer("percentage").notNull(),

    // Max total uses across all customers.
    // NULL = unlimited.
    maxUses: integer("max_uses"),

    // Bumped every time the code is applied to a new order.
    usedCount: integer("used_count").notNull().default(0),

    // Optional expiry. NULL = never expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Admin can pause a code without deleting it.
    isActive: boolean("is_active").notNull().default(true),

    // Audit
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
      // Code strings must be globally unique
      uniqueCode: unique("unique_discount_codes_code").on(table.code),
      // Fast lookup when admin filters by event
      idxEvent: index("idx_discount_codes_event").on(table.eventId),
    };
  }
);