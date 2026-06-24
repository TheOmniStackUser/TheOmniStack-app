const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT id, sku, title FROM order_items WHERE sku IS NULL LIMIT 5`;
  console.log(res);
  await sql.end();
}
run();
