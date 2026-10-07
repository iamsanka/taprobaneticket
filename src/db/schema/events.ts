import { pgTable, serial, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),

  eventTime: varchar("event_time", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),

  visibility: varchar("visibility", { length: 20 }).default("draft").notNull(),

  coverImage: varchar("cover_image", { length: 500 }),
  galleryImages: text("gallery_images").array(),

  // ⭐ NEW: Past event showcase content.
  // Only relevant when visibility = 'past'. Both nullable.
  pastEventTitle: varchar("past_event_title", { length: 255 }),
  pastEventStory: text("past_event_story"),

  createdBy: integer("created_by").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});