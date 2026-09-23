import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.execute(sql`ALTER TABLE "products" ADD COLUMN "sale_start_date" timestamp with time zone;`);
    console.log("Success 1");
  } catch (e: any) {
    console.error(e);
  }
  try {
    await db.execute(sql`ALTER TABLE "products" ADD COLUMN "sale_end_date" timestamp with time zone;`);
    console.log("Success 2");
  } catch (e: any) {
    console.error(e);
  }
  process.exit(0);
}
main();
