const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    console.log("Adding columns...");
    await sql`ALTER TABLE "products" ADD COLUMN "sale_start_date" timestamp with time zone`;
    console.log("sale_start_date added");
  } catch(e) { console.error(e.message); }

  try {
    await sql`ALTER TABLE "products" ADD COLUMN "sale_end_date" timestamp with time zone`;
    console.log("sale_end_date added");
  } catch(e) { console.error(e.message); }

  process.exit(0);
}
main();
