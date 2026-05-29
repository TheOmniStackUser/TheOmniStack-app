const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const counts = await sql`
    SELECT marketplace, count(*) 
    FROM orders 
    GROUP BY marketplace
  `;
  console.log("Order counts by marketplace:", counts);
  
  const integrations = await sql`
    SELECT id, type, is_active, metadata
    FROM marketplace_integrations
  `;
  console.log("All integrations:", integrations);
  
  await sql.end();
}

run().catch(console.error);
