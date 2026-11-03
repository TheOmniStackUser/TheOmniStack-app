ALTER TABLE "unmapped_marketplace_products" ADD COLUMN IF NOT EXISTS "is_blocked" boolean DEFAULT false NOT NULL;
ALTER TABLE "unmapped_marketplace_products" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "unmapped_company_blocked_idx" ON "unmapped_marketplace_products" ("company_id", "is_blocked");
