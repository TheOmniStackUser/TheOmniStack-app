ALTER TABLE "invoices" DROP CONSTRAINT "invoices_invoice_number_unique";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "marketplace" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_daily" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_time" text DEFAULT '03:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fetch_orders_marketplaces" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "unq_company_invoice_number" UNIQUE("company_id","invoice_number");