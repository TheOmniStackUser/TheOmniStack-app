ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "marketplace_confirmation_status" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "marketplace_confirmation_error" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "marketplace_confirmed_at" timestamp with time zone;
