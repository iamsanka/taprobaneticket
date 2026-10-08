CREATE TABLE "seating_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_seating_maps_event_category" UNIQUE("event_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "seating_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"label" varchar(64) NOT NULL,
	"rows" integer NOT NULL,
	"cols_per_row" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"color_hex" varchar(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_seating_sections_map_label" UNIQUE("map_id","label")
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"map_id" integer NOT NULL,
	"row_label" varchar(4) NOT NULL,
	"row_order" integer NOT NULL,
	"number_label" integer NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"booked_order_id" integer,
	"held_by_token" varchar(64),
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_seats_section_row_number" UNIQUE("section_id","row_label","number_label")
);
--> statement-breakpoint
ALTER TABLE "order_tickets" ADD COLUMN "seat_id" integer;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD COLUMN "seat_label" varchar(64);--> statement-breakpoint
ALTER TABLE "seating_maps" ADD CONSTRAINT "seating_maps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_maps" ADD CONSTRAINT "seating_maps_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_maps" ADD CONSTRAINT "seating_maps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_sections" ADD CONSTRAINT "seating_sections_map_id_seating_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."seating_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_section_id_seating_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."seating_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_map_id_seating_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."seating_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_seating_maps_event" ON "seating_maps" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_seating_maps_category" ON "seating_maps" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_seating_sections_map" ON "seating_sections" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "idx_seats_map_hold" ON "seats" USING btree ("map_id","hold_expires_at");--> statement-breakpoint
CREATE INDEX "idx_seats_hold_token" ON "seats" USING btree ("held_by_token");--> statement-breakpoint
CREATE INDEX "idx_seats_booked_order" ON "seats" USING btree ("booked_order_id");