ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "parcel_class" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "carrier" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_parcel_class" text DEFAULT 'XS';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "parcel_class" text;
