import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { ticketCategories } from "./ticketCategories";

export const ticketTypes = pgTable("ticket_types", {
  id: serial("id").primaryKey(),

  // Link to ticket category (Lounge, Standard, VIP)
  categoryId: integer("category_id")
    .notNull()
    .references(() => ticketCategories.id, { onDelete: "cascade" }),

  // Ticket type name (Adult, Child, Senior, Group, etc.)
  name: varchar("name", { length: 100 }).notNull(),

  // No price
  // No limit
  // No visibility

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
