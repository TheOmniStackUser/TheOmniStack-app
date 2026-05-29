const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const orders = await sql`
    SELECT marketplace_order_id, marketplace, shipping_country, raw_payload
    FROM orders
    WHERE (marketplace LIKE 'decathlon%' OR marketplace = 'mirakl_custom')
      AND status = 'shipped'
      AND updated_at >= '2026-05-25 00:00:00'
  `;
  
  console.log(`Orders info:`);
  for (const o of orders) {
    const raw = o.raw_payload;
    console.log(`- Order: ${o.marketplace_order_id}, Marketplace: ${o.marketplace}, Country: ${o.shipping_country}, Shop ID in Payload: ${raw?.shop_id}`);
  }
  
  await sql.end();
}

run().catch(console.error);
