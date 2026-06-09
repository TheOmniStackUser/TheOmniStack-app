const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = env.match(/DATABASE_URL="([^"]+)"/);
const dbUrl = dbUrlMatch ? dbUrlMatch[1] : null;

const postgres = require('postgres');

async function main() {
  const sql = postgres(dbUrl, { ssl: 'require' });
  const res = await sql`
    SELECT id, company_id, type, environment, client_id, client_secret, access_token, refresh_token, metadata 
    FROM marketplace_integrations 
    WHERE type = 'otto' AND environment = 'sandbox' 
    ORDER BY updated_at DESC LIMIT 5
  `;
  
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch(console.error);
