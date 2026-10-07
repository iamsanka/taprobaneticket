ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ticket_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;