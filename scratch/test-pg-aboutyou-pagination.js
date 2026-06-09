const postgres = require('postgres');

async function test() {
  const sql = postgres('postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');
  const res = await sql`SELECT api_key FROM marketplace_integrations WHERE type='aboutyou' LIMIT 1;`;
  if (res.length === 0) process.exit(0);
  const apiKey = res[0].api_key;
  
  const url = 'https://partner.aboutyou.com/api/v1/products?per_page=1';
  const apiRes = await fetch(url, {
    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
  });
  
  const data = await apiRes.json();
  console.log('Pagination:', data.pagination);
  process.exit(0);
}
test().catch(console.error);
