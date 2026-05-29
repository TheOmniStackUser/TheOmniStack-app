const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const integrations = await sql`
    SELECT id, type, is_active, metadata
    FROM marketplace_integrations
  `;
  
  console.log(`Integrations:`);
  for (const i of integrations) {
    console.log(`- ID: ${i.id}, Type: ${i.type}, Active: ${i.is_active}, Metadata:`, JSON.stringify(i.metadata));
  }
  
  await sql.end();
}

run().catch(console.error);
