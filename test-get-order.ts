import postgres from 'postgres'

async function run() {
  const sql = postgres("postgresql://neondb_owner:\!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require")
  const result = await sql`SELECT raw_payload FROM orders WHERE marketplace_order_id = '4bcb8ff7-6de5-47a6-9465-42d6abf2b1dd'`
  console.log("Raw payload is NULL:", result[0].raw_payload === null)
  process.exit(0)
}
run()
