const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const res = await sql`
    SELECT o.id, o.marketplace_order_id, COUNT(i.id) as item_count
    FROM orders o
    LEFT JOIN order_items i ON o.id = i.order_id
    WHERE o.marketplace = 'limango'
    GROUP BY o.id
    HAVING COUNT(i.id) = 0
    LIMIT 5
  `;
  console.log("Empty items for limango:", res);
  await sql.end();
}
run();
