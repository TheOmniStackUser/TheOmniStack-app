ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_schedule_mode" text DEFAULT 'times' NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_interval" text DEFAULT '60';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_business_hours_start" text DEFAULT '08:00';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_business_hours_end" text DEFAULT '18:00';
