import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),

  eventTime: varchar("event_time", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),

  visibility: varchar("visibility", { length: 20 }).default("draft").notNull(),

  coverImage: varchar("cover_image", { length: 500 }),
  galleryImages: text("gallery_images").array(),

  // Past event showcase content.
  pastEventTitle: varchar("past_event_title", { length: 255 }),
  pastEventStory: text("past_event_story"),

  // ⭐ NEW — Ticket design (super-admin only)
  // Portrait background image for printed ticket PDFs.
  // NULL = use the classic white card design.
  ticketImageUrl: varchar("ticket_image_url", { length: 500 }),

  // ⭐ NEW — Text color that reads well on top of the image.
  // "light" = white text over a dark scrim
  // "dark"  = dark text over a light scrim
  // NULL when no image is set.
  ticketImageTextColor: varchar("ticket_image_text_color", { length: 10 }),

  createdBy: integer("created_by").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});