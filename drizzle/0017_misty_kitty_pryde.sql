CREATE TYPE "public"."expense_payment_method" AS ENUM('bank_transfer', 'cash', 'card', 'mobilepay', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('artists_crew', 'production_equipment', 'event_venue', 'marketing', 'operations', 'admin', 'travel', 'catering', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('quote', 'booked', 'partial', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."receipt_method" AS ENUM('bank_transfer', 'cash', 'card', 'mobilepay', 'other');--> statement-breakpoint
CREATE TYPE "public"."income_category" AS ENUM('director_share', 'sponsorship', 'donation', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."income_status" AS ENUM('expected', 'partial', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_cost_method" AS ENUM('card', 'epassi', 'edenred');--> statement-breakpoint
CREATE TYPE "public"."payment_cost_mode" AS ENUM('percentage_plus_fixed', 'percentage_or_fixed');--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" "expense_payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"category" "expense_category" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"supplier" varchar(255),
	"sub_category" varchar(128),
	"gross_amount" bigint NOT NULL,
	"status" "expense_status" DEFAULT 'quote' NOT NULL,
	"issue_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"income_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" "receipt_method" DEFAULT 'bank_transfer' NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"category" "income_category" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"payer" varchar(255),
	"gross_amount" bigint NOT NULL,
	"status" "income_status" DEFAULT 'expected' NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_method_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" "payment_cost_method" NOT NULL,
	"mode" "payment_cost_mode" NOT NULL,
	"percentage_bps" integer DEFAULT 0 NOT NULL,
	"fixed_amount" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_payment_method_cost" UNIQUE("method")
);
--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_receipts" ADD CONSTRAINT "income_receipts_income_id_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_receipts" ADD CONSTRAINT "income_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_costs" ADD CONSTRAINT "payment_method_costs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;