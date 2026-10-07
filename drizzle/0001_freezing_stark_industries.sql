CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"visibility" varchar(20) DEFAULT 'draft' NOT NULL,
	"cover_image" varchar(500),
	"gallery_images" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
