ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 4) DEFAULT '0.19';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_rate_source" text DEFAULT 'platform' NOT NULL;
