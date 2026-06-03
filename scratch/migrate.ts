import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'
import fs from 'fs'

async function migrate() {
  try {
    await db.execute(sql.raw(`
      ALTER TABLE "company_members" ADD COLUMN IF NOT EXISTS "api_key" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "api_key" text;
    `))
    try {
      await db.execute(sql.raw(`ALTER TABLE "company_members" ADD CONSTRAINT "company_members_api_key_unique" UNIQUE("api_key");`))
    } catch(e: any) {
      if (!e.message.includes('already exists')) console.error("Unique constraint error on members:", e)
    }
    try {
      await db.execute(sql.raw(`ALTER TABLE "companies" ADD CONSTRAINT "companies_api_key_unique" UNIQUE("api_key");`))
    } catch(e: any) {
      if (!e.message.includes('already exists')) console.error("Unique constraint error on companies:", e)
    }
    console.log("Migration successful!")
  } catch (error) {
    console.error("Migration failed:", error)
  }
  process.exit(0)
}

migrate()
