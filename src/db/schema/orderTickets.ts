import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { events } from "./events";
import { ticketTypes } from "./ticketTypes";

export const orderTickets = pgTable("order_tickets", {
  id: serial("id").primaryKey(),

  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),

  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),

  ticketTypeId: integer("ticket_type_id")
    .notNull()
    .references(() => ticketTypes.id, { onDelete: "restrict" }),

  ticketNumber: varchar("ticket_number", { length: 64 }).notNull(),

  // The scanned payload (JSON as string). What the QR encodes.
  qrCodeData: varchar("qr_code_data", { length: 1024 }).notNull(),

  isScanned: boolean("is_scanned").notNull().default(false),

  // ⭐ NEW: exact moment the ticket was scanned (null = never scanned)
  scannedAt: timestamp("scanned_at", { withTimezone: true }),

  // ⭐ NEW: audit field
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});