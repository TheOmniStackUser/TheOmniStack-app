ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_times" jsonb DEFAULT '["03:00"]'::jsonb NOT NULL;
UPDATE "companies" 
SET "fetch_orders_times" = jsonb_build_array("fetch_orders_time") 
WHERE "fetch_orders_time" IS NOT NULL AND ("fetch_orders_times" = '["03:00"]'::jsonb OR "fetch_orders_times" IS NULL);
