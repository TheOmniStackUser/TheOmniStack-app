CREATE TYPE "public"."dunning_stage" AS ENUM('reminder', 'first', 'second');--> statement-breakpoint
CREATE TYPE "public"."dunning_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."marketplace" ADD VALUE 'woocommerce';--> statement-breakpoint
ALTER TYPE "public"."marketplace" ADD VALUE 'shopware';--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'woocommerce';--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'shopware';--> statement-breakpoint
CREATE TABLE "dunning_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"stage" "dunning_stage" NOT NULL,
	"status" "dunning_status" DEFAULT 'sent' NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "dunning_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stage" "dunning_stage" NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"days_after_due" integer DEFAULT 0 NOT NULL,
	"subject_template" text DEFAULT '' NOT NULL,
	"body_template" text DEFAULT '' NOT NULL,
	"fee_amount" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_footer" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_footer_en" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "offer_footer" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "offer_footer_en" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dunning_exclusions" ADD CONSTRAINT "dunning_exclusions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_logs" ADD CONSTRAINT "dunning_logs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_logs" ADD CONSTRAINT "dunning_logs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_rules" ADD CONSTRAINT "dunning_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_company_active_idx" ON "orders" USING btree ("company_id","is_archived","status","marketplace_purchase_date");--> statement-breakpoint
CREATE INDEX "orders_company_created_at_idx" ON "orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_company_doc_created_idx" ON "invoices" USING btree ("company_id","document_type","created_at");--> statement-breakpoint
CREATE INDEX "returns_log_company_scanned_idx" ON "returns_log" USING btree ("company_id","scanned_at");