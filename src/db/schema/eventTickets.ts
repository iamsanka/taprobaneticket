import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { events } from "./events";
import { ticketCategories } from "./ticketCategories";
import { ticketTypes } from "./ticketTypes";

export const eventTickets = pgTable("event_tickets", {
  id: serial("id").primaryKey(),

  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),

  categoryId: integer("category_id")
    .notNull()
    .references(() => ticketCategories.id, { onDelete: "cascade" }),

  typeId: integer("type_id")
    .notNull()
    .references(() => ticketTypes.id, { onDelete: "cascade" }),

  // Event-specific price (in cents)
  price: integer("price").notNull(),

  // Event-specific limit (optional)
  limit: integer("limit"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    uniqueTicket: unique("unique_event_ticket")
      .on(table.eventId, table.categoryId, table.typeId),
  };
});
