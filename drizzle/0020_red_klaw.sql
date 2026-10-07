CREATE TYPE "public"."external_link_type" AS ENUM('youtube', 'facebook', 'instagram', 'photo_album', 'website', 'other');--> statement-breakpoint
CREATE TABLE "event_external_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"type" "external_link_type" DEFAULT 'other' NOT NULL,
	"label" varchar(255) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_external_links" ADD CONSTRAINT "event_external_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;