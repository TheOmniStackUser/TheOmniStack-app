const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const logs = await sql`
    SELECT * FROM audit_logs
    WHERE entity_id = 'DE5KGLY6365W-A' 
       OR entity_id = '794e920a-99d9-4f1e-ada0-0763dee5f4f6'
       OR (metadata::text LIKE '%DE5KGLY6365W-A%')
    ORDER BY created_at DESC
  `;
  
  console.log(`Found ${logs.length} audit logs:`);
  for (const l of logs) {
    console.log(`---------------------------------------------`);
    console.log(`ID: ${l.id}`);
    console.log(`Action: ${l.action}`);
    console.log(`Entity Type: ${l.entity_type}`);
    console.log(`Entity ID: ${l.entity_id}`);
    console.log(`Created At: ${l.created_at}`);
    console.log(`Metadata:`, JSON.stringify(l.metadata));
  }
  
  await sql.end();
}

run().catch(console.error);
