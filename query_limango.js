const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT id, marketplace_order_id, marketplace FROM orders WHERE marketplace = 'limango' LIMIT 5`;
  console.log(res);
  await sql.end();
}
run();
