CREATE TYPE "public"."incoming_invoice_status" AS ENUM('draft', 'pending_payment', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "incoming_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_vat_id" text,
	"supplier_email" text,
	"supplier_iban" text,
	"supplier_bic" text,
	"invoice_number" text NOT NULL,
	"status" "incoming_invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"file_storage_key" text,
	"file_type" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid
);
--> statement-breakpoint
ALTER TABLE "incoming_invoices" ADD CONSTRAINT "incoming_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_invoices" ADD CONSTRAINT "incoming_invoices_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incoming_inv_company_supplier_idx" ON "incoming_invoices" USING btree ("company_id","supplier_name");