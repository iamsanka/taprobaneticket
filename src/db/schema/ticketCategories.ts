import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const ticketCategories = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),

  // Category name (Lounge, Standard, VIP, etc.)
  name: varchar("name", { length: 100 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
