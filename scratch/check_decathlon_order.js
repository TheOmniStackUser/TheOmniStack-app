const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const [order] = await sql`
    SELECT id, marketplace, marketplace_order_id, status, raw_payload
    FROM orders
    WHERE marketplace_order_id = 'DE5KL68VWW6D-A'
  `;
  
  if (order) {
    console.log(`Order ID: ${order.id}`);
    console.log(`Marketplace: ${order.marketplace}`);
    console.log(`Raw Payload:`, JSON.stringify(order.raw_payload, null, 2));
  } else {
    console.log("Order not found.");
  }
  
  await sql.end();
}

run().catch(console.error);
