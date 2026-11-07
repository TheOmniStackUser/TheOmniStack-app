ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_preorder" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "products_company_preorder_idx" ON "products" ("company_id", "is_preorder");
