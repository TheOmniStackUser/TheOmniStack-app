const postgres = require('postgres');

async function main() {
  const url = 'postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  const sql = postgres(url);
  const res = await sql`SELECT client_id, client_secret, access_token, metadata FROM marketplace_integrations WHERE type='otto' AND environment='sandbox' ORDER BY updated_at DESC LIMIT 1`;
  
  if (res.length === 0) return;
  const { client_id: clientId, client_secret: clientSecret, metadata } = res[0];
  const { appId, installationId } = metadata;
  
  console.log(`Using App ID: ${appId}`);
  console.log(`Using Installation ID: ${installationId}`);
  
  // 1. Get Dev Token
  console.log('1. Fetching Developer Token...');
  const devTokenRes = await fetch('https://sandbox.api.otto.market/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'developer'
    }).toString()
  });
  
  if (!devTokenRes.ok) {
     console.log('Failed to get Dev Token. Status:', devTokenRes.status);
     console.log('Body:', await devTokenRes.text());
     process.exit(1);
  }
  
  const devTokenData = await devTokenRes.json();
  const devToken = devTokenData.access_token;
  console.log('Successfully acquired Dev Token!');
  
  // 2. Get Installation Token
  console.log(`2. Exchanging Dev Token for Installation Token...`);
  const installTokenUrl = `https://sandbox.api.otto.market/v1/apps/${appId}/installations/${installationId}/accessToken`;
  
  const installTokenRes = await fetch(installTokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${devToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'orders products shipments returns receipts availability price-reduction'
    }).toString()
  });
  
  if (!installTokenRes.ok) {
     console.log('Failed to get Installation Token. Status:', installTokenRes.status);
     console.log('Body:', await installTokenRes.text());
     process.exit(1);
  }
  
  const installData = await installTokenRes.json();
  const instToken = installData.access_token;
  console.log('Successfully acquired Installation Token!');
  
  // 3. Test GET /v4/orders
  const endpoints = [
    { name: 'Orders', url: 'https://sandbox.api.otto.market/v4/orders' },
    { name: 'Products', url: 'https://sandbox.api.otto.market/v3/products' },
    { name: 'Shipments', url: 'https://sandbox.api.otto.market/v1/shipments' },
    { name: 'Returns', url: 'https://sandbox.api.otto.market/v2/returns' },
    { name: 'Receipts', url: 'https://sandbox.api.otto.market/v3/receipts' },
    { name: 'Availability', url: 'https://sandbox.api.otto.market/v1/quantities' },
    { name: 'Price Reduction', url: 'https://sandbox.api.otto.market/v2/products/price-reductions' }
  ];

  for (const endpoint of endpoints) {
    console.log(`\nCalling ${endpoint.name}: GET ${endpoint.url}`);
    const res = await fetch(endpoint.url, {
      headers: {
        'Authorization': `Bearer ${instToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ ${endpoint.name} Success:`, JSON.stringify(data).slice(0, 100) + '...');
    } else {
      console.log(`❌ ${endpoint.name} Failed: ${res.status}`, await res.text());
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
