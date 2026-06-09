const postgres = require('postgres');

async function main() {
  const url = 'postgresql://neondb_owner:\!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  const sql = postgres(url);
  const res = await sql`SELECT client_id, client_secret FROM marketplace_integrations WHERE type='otto' AND environment='sandbox' ORDER BY updated_at DESC LIMIT 1`;
  
  if (res.length === 0) return;
  const { client_id: clientId, client_secret: clientSecret } = res[0];
  
  console.log(`Using Client ID: ${clientId}`);
  
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  console.log('1. Fetching Developer Token...');
  const devTokenRes = await fetch('https://sandbox.api.otto.market/v1/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  const devTokenData = await devTokenRes.json();
  const devToken = devTokenData.access_token;
  console.log('Got Dev Token');
  
  const testAppId = 'b5761696-72b1-4193-9995-0006d62e85ee';
  
  console.log(`2. Fetching Installations List...`);
  const installUrl = `https://sandbox.api.otto.market/v1/apps/${testAppId}/installations`;
  
  const installRes = await fetch(installUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${devToken}`,
      'Accept': 'application/json'
    }
  });
  
  console.log(`Installations Response Status: ${installRes.status}`);
  console.log(await installRes.text());
  
  process.exit(0);
}
main().catch(console.error);
