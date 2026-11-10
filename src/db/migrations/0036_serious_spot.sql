CREATE TYPE "public"."marketplace_message_sender_type" AS ENUM('customer', 'seller', 'system');--> statement-breakpoint
CREATE TYPE "public"."marketplace_question_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TYPE "public"."marketplace_question_type" AS ENUM('product', 'order', 'general');--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'dpd';--> statement-breakpoint
ALTER TYPE "public"."system_service" ADD VALUE 'dpd';--> statement-breakpoint
CREATE TABLE "marketplace_question_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"sender_type" "marketplace_message_sender_type" DEFAULT 'customer' NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text,
	"message_text" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"external_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"marketplace" text DEFAULT 'otto' NOT NULL,
	"integration_id" uuid,
	"external_question_id" text NOT NULL,
	"status" "marketplace_question_status" DEFAULT 'open' NOT NULL,
	"question_type" "marketplace_question_type" DEFAULT 'general' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"product_sku" text,
	"product_title" text,
	"marketplace_product_id" text,
	"marketplace_order_id" text,
	"order_id" uuid,
	"subject" text NOT NULL,
	"question_text" text NOT NULL,
	"deadline_at" timestamp with time zone,
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"last_answer_text" text,
	"answered_at" timestamp with time zone,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tax_rate_source" text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_schedule_mode" text DEFAULT 'times' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_interval" text DEFAULT '60';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_business_hours_start" text DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_business_hours_end" text DEFAULT '18:00';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_times" jsonb DEFAULT '["03:00"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "marketplace_confirmation_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "marketplace_confirmation_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "marketplace_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_preorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_rate" numeric(5, 4) DEFAULT '0.19';--> statement-breakpoint
ALTER TABLE "marketplace_question_messages" ADD CONSTRAINT "marketplace_question_messages_question_id_marketplace_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."marketplace_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_questions" ADD CONSTRAINT "marketplace_questions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_questions" ADD CONSTRAINT "marketplace_questions_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_questions" ADD CONSTRAINT "marketplace_questions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_company_preorder_idx" ON "products" USING btree ("company_id","is_preorder");