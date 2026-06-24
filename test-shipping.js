const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`
    SELECT id, marketplace_order_id, shipping_name, buyer_name 
    FROM orders 
    WHERE marketplace = 'limango' AND shipping_name IS NULL
    LIMIT 5
  `;
  console.log("Limango orders with null shipping_name:", res);
  await sql.end();
}
run();
