import { db } from './src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log("Running migration...");
  try {
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "features_returns_enabled" boolean DEFAULT false NOT NULL;`);
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "features_products_enabled" boolean DEFAULT false NOT NULL;`);
    await db.execute(sql`UPDATE "companies" SET "features_returns_enabled" = true, "features_products_enabled" = true;`);
    console.log("Migration complete!");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
