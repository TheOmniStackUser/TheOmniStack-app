ALTER TABLE "customers" DROP CONSTRAINT "unq_company_customer_email";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_company" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "company_name" text;