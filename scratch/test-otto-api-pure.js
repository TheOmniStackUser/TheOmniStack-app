const postgres = require('postgres');

async function main() {
  const url = 'postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  const sql = postgres(url);
  const res = await sql`SELECT client_id, client_secret, environment, metadata FROM marketplace_integrations WHERE type='otto' AND environment='sandbox' ORDER BY updated_at DESC LIMIT 1`;
  
  if (res.length === 0) {
    console.log('No otto connection');
    return;
  }
  
  const c = res[0];
  const clientId = c.client_id;
  const clientSecret = c.client_secret;
  const environment = c.environment;
  const metadata = c.metadata || {};
  const appId = clientId;
  const installationId = metadata?.installationId;
  
  const tokenUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market/v1/token' : 'https://api.otto.market/v1/token';
  const baseUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market';

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  console.log('Testing client_credentials without scopes (getting access token)...');
  const devTokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  const devTokenData = await devTokenRes.json();
  const accessToken = devTokenData.access_token;
  console.log(`Access Token: ${accessToken ? 'RECEIVED' : 'MISSING'}`);
  
  if (accessToken) {
    console.log('Attempting to fetch orders using this token...');
    const ordersUrl = `${baseUrl}/v4/orders`;
    const ordersRes = await fetch(ordersUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    console.log(`Orders API returned: ${ordersRes.status}`);
    console.log(await ordersRes.text());
  }
  return;

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  };

  const endpoints = [
    { name: 'Products', url: '/v5/products?limit=1' },
    { name: 'Availability', url: '/v1/availability/quantities?limit=1' },
    { name: 'Orders', url: '/v4/orders?limit=1' },
    { name: 'Shipments', url: '/v1/shipments?limit=1' },
    { name: 'Returns', url: '/v1/returns?limit=1' },
    { name: 'Receipts', url: '/v3/receipts?limit=1' },
    { name: 'Price Reduction', url: '/v2/price-reductions?limit=1' }
  ];

  for (const ep of endpoints) {
    console.log(`\n--- Testing Scope: ${ep.name} ---`);
    console.log(`GET ${ep.url}`);
    try {
      const res = await fetch(`${baseUrl}${ep.url}`, { headers });
      console.log(`Status: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        console.log(`Error Response:`, await res.text());
      } else {
        const text = await res.text();
        const preview = text.slice(0, 200).replace(/\n/g, '');
        console.log(`Success! Data preview:`, preview + (text.length > 200 ? '...' : ''));
      }
    } catch (e) {
      console.log(`Failed to fetch ${ep.name}:`, e.message);
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
