const postgres = require('postgres');

async function main() {
  const url = 'postgresql://neondb_owner:\!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  const sql = postgres(url);
  const res = await sql`SELECT client_id, client_secret FROM marketplace_integrations WHERE type='otto' AND environment='sandbox' ORDER BY updated_at DESC LIMIT 1`;
  
  if (res.length === 0) return;
  const { client_id: clientId, client_secret: clientSecret } = res[0];
  
  console.log(`Using Client ID: ${clientId}`);
  
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  // 1. Get Dev Token
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
  
  // 2. Try to get Installation Token using Client ID as Installation ID
  // Wait, the App ID is different from the Client ID! 
  // Let's use the App ID the user showed in the screenshot: b5761696-72b1-4193-9995-0006d62e85ee
  const testAppId = 'b5761696-72b1-4193-9995-0006d62e85ee';
  const sandboxInstId = clientId;
  
  console.log(`2. Exchanging Dev Token for Installation Token...`);
  const installTokenUrl = `https://sandbox.api.otto.market/v1/apps/${testAppId}/installations/${sandboxInstId}/accessToken`;
  
  // Try without scope
  const installTokenRes = await fetch(installTokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${devToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials'
    }).toString()
  });
  
  console.log(`Installation Token Response Status: ${installTokenRes.status}`);
  const text = await installTokenRes.text();
  console.log(text);
  
  if (installTokenRes.ok) {
     const data = JSON.parse(text);
     const instToken = data.access_token;
     
     // 3. Try to fetch orders
     console.log('3. Fetching Orders with Installation Token...');
     const ordersRes = await fetch('https://sandbox.api.otto.market/v4/orders', {
        headers: { 'Authorization': `Bearer ${instToken}` }
     });
     console.log(`Orders Response: ${ordersRes.status}`);
     console.log(await ordersRes.text());
  }
  process.exit(0);
}
main().catch(console.error);
