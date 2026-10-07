import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { events } from "./events";

/* ============================
   EXTERNAL LINK TYPE ENUM
============================ */

export const externalLinkTypeEnum = pgEnum("external_link_type", [
  "youtube",
  "facebook",
  "instagram",
  "photo_album",
  "website",
  "other",
]);

/* ============================
   EVENT EXTERNAL LINKS
============================ */

export const eventExternalLinks = pgTable("event_external_links", {
  id: serial("id").primaryKey(),

  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),

  // Which kind of link this is — drives the icon + color on the customer page
  type: externalLinkTypeEnum("type").notNull().default("other"),

  // Short label the user sees on the card: "Watch the aftermovie"
  label: varchar("label", { length: 255 }).notNull(),

  // The full URL. Validated server-side to start with http(s)://
  url: varchar("url", { length: 1000 }).notNull(),

  // Manual sort order — lower numbers appear first
  sortOrder: integer("sort_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});