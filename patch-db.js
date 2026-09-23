const { sql } = require('@vercel/postgres');
require('dotenv').config({ path: '.env.local' });

async function main() {
  try {
    console.log("Adding columns...");
    await sql`ALTER TABLE "products" ADD COLUMN "sale_start_date" timestamp with time zone`;
    await sql`ALTER TABLE "products" ADD COLUMN "sale_end_date" timestamp with time zone`;
    console.log("Columns added!");
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('Columns already exist.');
    } else {
      console.error(e);
    }
  }
}
main();
