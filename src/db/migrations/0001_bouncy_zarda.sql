ALTER TYPE "public"."marketplace" ADD VALUE 'aboutyou';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'draft' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'login_2fa' BEFORE 'sync_start';--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'aboutyou';--> statement-breakpoint
CREATE TABLE "invoice_text_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_number" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"street" text,
	"zip" text,
	"city" text,
	"country" text DEFAULT 'DE' NOT NULL,
	"vat_id" text,
	"last_vat_check_at" timestamp with time zone,
	"vat_check_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_customer_email" UNIQUE("company_id","email"),
	CONSTRAINT "unq_company_customer_number" UNIQUE("company_id","customer_number")
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "returns_note" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "returns_note_en" text;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "draft_name" text;--> statement-breakpoint
ALTER TABLE "invoice_text_templates" ADD CONSTRAINT "invoice_text_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;