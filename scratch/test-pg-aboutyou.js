const postgres = require('postgres');

async function test() {
  const sql = postgres('postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');
  
  const res = await sql`SELECT api_key FROM marketplace_integrations WHERE type='aboutyou' LIMIT 1;`;
  
  if (res.length === 0) {
    console.log('No AboutYou integration found in DB.');
    process.exit(0);
  }
  
  const apiKey = res[0].api_key;
  console.log('Found API Key ending in:', apiKey.substring(apiKey.length - 5));
  
  const url = 'https://partner.aboutyou.com/api/v1/products?per_page=10';
  const apiRes = await fetch(url, {
    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
  });
  
  console.log('Status:', apiRes.status);
  const text = await apiRes.text();
  console.log('Response:', text.substring(0, 300));
  
  process.exit(0);
}

test().catch(console.error);
