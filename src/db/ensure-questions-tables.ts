import { db } from '@/db/client'
import { sql } from 'drizzle-orm'

let isInitialized = false

export async function ensureQuestionsTablesExist() {
  if (isInitialized) return

  try {
    // 1. Create Enums if they do not exist
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "marketplace_message_sender_type" AS ENUM('customer', 'seller', 'system');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `)

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "marketplace_question_status" AS ENUM('open', 'answered', 'closed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `)

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "marketplace_question_type" AS ENUM('product', 'order', 'general');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `)

    // 2. Create questions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketplace_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action,
        "marketplace" text DEFAULT 'otto' NOT NULL,
        "integration_id" uuid REFERENCES "marketplace_integrations"("id") ON DELETE set null ON UPDATE no action,
        "external_question_id" text NOT NULL,
        "status" "marketplace_question_status" DEFAULT 'open' NOT NULL,
        "question_type" "marketplace_question_type" DEFAULT 'general' NOT NULL,
        "customer_name" text NOT NULL,
        "customer_email" text,
        "product_sku" text,
        "product_title" text,
        "marketplace_product_id" text,
        "marketplace_order_id" text,
        "order_id" uuid REFERENCES "orders"("id") ON DELETE set null ON UPDATE no action,
        "subject" text NOT NULL,
        "question_text" text NOT NULL,
        "deadline_at" timestamp with time zone,
        "sla_hours" integer DEFAULT 48 NOT NULL,
        "last_answer_text" text,
        "answered_at" timestamp with time zone,
        "raw_payload" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `)

    // 3. Create question messages table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketplace_question_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "question_id" uuid NOT NULL REFERENCES "marketplace_questions"("id") ON DELETE cascade ON UPDATE no action,
        "sender_type" "marketplace_message_sender_type" DEFAULT 'customer' NOT NULL,
        "sender_name" text NOT NULL,
        "sender_email" text,
        "message_text" text NOT NULL,
        "status" text DEFAULT 'sent' NOT NULL,
        "external_message_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `)

    // 4. Create Indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_marketplace_questions_company" ON "marketplace_questions" ("company_id");
      CREATE INDEX IF NOT EXISTS "idx_marketplace_questions_status" ON "marketplace_questions" ("status");
      CREATE INDEX IF NOT EXISTS "idx_marketplace_questions_deadline" ON "marketplace_questions" ("deadline_at");
      CREATE INDEX IF NOT EXISTS "idx_marketplace_question_messages_question" ON "marketplace_question_messages" ("question_id");
    `)

    isInitialized = true
  } catch (error) {
    console.error('[ensureQuestionsTablesExist] Failed to ensure tables:', error)
  }
}
