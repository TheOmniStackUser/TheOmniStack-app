const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const orders = await sql`
    SELECT id, marketplace, marketplace_order_id, status, created_at
    FROM orders
    WHERE marketplace_order_id LIKE 'DE5K%' 
       OR marketplace_order_id LIKE 'BE5K%'
       OR marketplace_order_id LIKE 'FR5K%'
    ORDER BY created_at DESC
  `;
  
  console.log(`Found ${orders.length} Decathlon DE/BE/FR orders:`);
  for (const o of orders) {
    console.log(`${o.marketplace_order_id} | ${o.marketplace} | ${o.status} | ${o.created_at.toISOString()}`);
  }
  
  await sql.end();
}

run().catch(console.error);
