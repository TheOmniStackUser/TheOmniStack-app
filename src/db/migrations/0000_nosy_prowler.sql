CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."marketplace" AS ENUM('amazon', 'otto', 'mirakl_decathlon', 'mirakl_decathlon_eu', 'mirakl_mediamarkt', 'manual', 'shopify');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'processing', 'invoiced', 'shipped', 'cancelled', 'later_shipment');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'cancel', 'issue', 'login', 'logout', 'sync_start', 'sync_complete', 'sync_error');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('amazon', 'otto', 'mirakl_decathlon', 'mirakl_decathlon_eu', 'mirakl_mediamarkt', 'hermes', 'dhl', 'shopify');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"active_company_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"vat_id" text,
	"street" text,
	"zip" text,
	"city" text,
	"country" text DEFAULT 'DE' NOT NULL,
	"email" text,
	"phone" text,
	"warehouse_street" text,
	"warehouse_zip" text,
	"warehouse_city" text,
	"warehouse_country" text DEFAULT 'DE',
	"logo_url" text,
	"website" text,
	"payment_recipient" text,
	"bank_name" text,
	"iban" text,
	"bic" text,
	"management" text,
	"registration_court" text,
	"delivery_note_footer" text,
	"delivery_note_footer_en" text,
	"international_language" text DEFAULT 'en' NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"next_invoice_number" text DEFAULT '1' NOT NULL,
	"next_customer_number" text DEFAULT '1' NOT NULL,
	"next_delivery_note_number" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"sku" text,
	"asin" text,
	"title" text NOT NULL,
	"quantity" numeric(10, 0) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.19' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"marketplace_order_id" text NOT NULL,
	"marketplace_purchase_date" timestamp with time zone,
	"buyer_name" text,
	"buyer_email" text,
	"shipping_name" text,
	"shipping_street" text,
	"shipping_city" text,
	"shipping_zip" text,
	"shipping_country" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"subtotal_amount" numeric(12, 2),
	"tax_amount" numeric(12, 2),
	"total_amount" numeric(12, 2),
	"raw_payload" jsonb,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"invoice_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"customer_number" text,
	"delivery_note_number" text,
	"tracking_number" text,
	"label_url" text,
	"return_tracking_number" text,
	"return_label_url" text,
	"total_weight" numeric(8, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_marketplace_order" UNIQUE("company_id","marketplace_order_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"position" numeric(4, 0) NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.19' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_street" text,
	"recipient_zip" text,
	"recipient_city" text,
	"recipient_country" text DEFAULT 'DE' NOT NULL,
	"recipient_email" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.19' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"pdf_storage_key" text,
	"pdf_generated_at" timestamp with time zone,
	"is_credit_note" boolean DEFAULT false NOT NULL,
	"cancels_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"previous_state" jsonb,
	"next_state" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "integration_type" NOT NULL,
	"client_id" text,
	"client_secret" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"seller_id" text,
	"api_key" text,
	"environment" text DEFAULT 'production',
	"metadata" jsonb,
	"auto_invoice" boolean DEFAULT false NOT NULL,
	"upload_invoice" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"vat_type" text DEFAULT 'oss' NOT NULL,
	"vat_rate" numeric(5, 4) NOT NULL,
	"local_vat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_country_vat" UNIQUE("company_id","country_code")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_integrations" ADD CONSTRAINT "marketplace_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_settings" ADD CONSTRAINT "vat_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;