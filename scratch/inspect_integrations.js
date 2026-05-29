const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const integrations = await sql`
    SELECT id, type, environment, metadata, is_active
    FROM marketplace_integrations
    WHERE type::text LIKE 'mirakl_%' OR type::text = 'mirakl_custom'
  `;
  
  console.log(`Found ${integrations.length} Mirakl integrations in DB:`);
  for (const i of integrations) {
    console.log(`---------------------------------------------`);
    console.log(`ID: ${i.id}`);
    console.log(`Type: ${i.type}`);
    console.log(`URL: ${i.environment}`);
    console.log(`Is Active: ${i.is_active}`);
    console.log(`Metadata:`, JSON.stringify(i.metadata));
  }
  
  await sql.end();
}

run().catch(console.error);
