import { db } from './src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log("Running migration...");
  try {
    await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "notes" text;`);
    console.log("Migration complete!");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
