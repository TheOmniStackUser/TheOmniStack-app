-- Migration: Fix member_role enum
-- Add new role values: 'staff', 'omnistack_support', 'omnistack_beta'
-- Migrate existing 'member' values to 'staff'

-- Step 1: Add the new enum values
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'staff';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'omnistack_support';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'omnistack_beta';--> statement-breakpoint

-- Step 2: Migrate existing 'member' entries to 'staff'
-- (requires a workaround since PostgreSQL doesn't allow direct enum value rename)
UPDATE "company_members" SET "role" = 'staff' WHERE "role" = 'member';--> statement-breakpoint

-- Step 3: Update the column default from 'member' to 'staff'
ALTER TABLE "company_members" ALTER COLUMN "role" SET DEFAULT 'staff';
