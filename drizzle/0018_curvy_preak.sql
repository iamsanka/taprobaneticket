CREATE TYPE "public"."email_campaign_status" AS ENUM('sending', 'sent', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_recipient_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_recipient_type" AS ENUM('customers', 'staff', 'manual');--> statement-breakpoint
CREATE TABLE "email_campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"status" "email_recipient_status" NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"recipient_type" "email_recipient_type" NOT NULL,
	"status" "email_campaign_status" DEFAULT 'sending' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;