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
  
  // 1. Get Token (Private App approach)
  console.log('\n--- 1. Fetching Private App Token ---');
  const tokenRes = await fetch('https://sandbox.api.otto.market/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  
  if (!tokenRes.ok) {
     console.log('Failed to get Token. Status:', tokenRes.status, await tokenRes.text());
     process.exit(1);
  }
  
  const token = (await tokenRes.json()).access_token;
  console.log('✅ Successfully acquired Token!');
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  console.log(`\n--- 3. Testing API Scopes ---`);
  
  // Test 1: Orders (GET)
  const ordersRes = await fetch('https://sandbox.api.otto.market/v4/orders', { headers });
  console.log(`Orders (GET /v4/orders): ${ordersRes.status}`);
  console.log(`Body:`, await ordersRes.text());

  // Test 2: Products (GET)
  const productsRes = await fetch('https://sandbox.api.otto.market/v5/products', { headers });
  console.log(`\nProducts (GET /v5/products): ${productsRes.status}`);
  console.log(`Body:`, await productsRes.text());

  // Test 3: Availability / Quantities (GET)
  const qtyRes = await fetch('https://sandbox.api.otto.market/v1/availability/quantities', { headers });
  console.log(`\nAvailability (GET /v1/availability/quantities): ${qtyRes.status}`);
  console.log(`Body:`, await qtyRes.text());

  // Test 4: Shipments (POST)
  const shipmentsRes = await fetch('https://sandbox.api.otto.market/v1/shipments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      trackingKey: { carrier: "DHL", trackingNumber: "9999999" },
      shipDate: new Date().toISOString(),
      shipFromAddress: { city: "Hamburg", countryCode: "DEU", zipCode: "20095" },
      positionItems: [{ positionItemId: "DUMMY_ID", salesOrderId: "DUMMY_ORDER" }]
    })
  });
  console.log(`\nShipments (POST /v1/shipments): ${shipmentsRes.status}`);
  console.log(`Body:`, await shipmentsRes.text());

  // Test 5: Returns (POST - Refund)
  const returnsRes = await fetch('https://sandbox.api.otto.market/v3/returns/acceptance', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      positionItems: [{ salesOrderId: "DUMMY", positionItemId: "DUMMY", reason: "RETURN_RECEIVED", condition: "A" }]
    })
  });
  console.log(`\nReturns (POST /v3/returns/acceptance): ${returnsRes.status}`);
  console.log(`Body:`, await returnsRes.text());

  // Test 6: Price Reduction (POST)
  const priceRedRes = await fetch('https://sandbox.api.otto.market/v2/products/price-reductions', {
    method: 'POST',
    headers,
    body: JSON.stringify([{ positionItemId: "DUMMY", amount: { amount: 5, currency: "EUR" } }])
  });
  console.log(`\nPrice Reduction (POST /v2/products/price-reductions): ${priceRedRes.status}`);
  console.log(`Body:`, await priceRedRes.text());

  // Test 7: Receipts (GET)
  const receiptsRes = await fetch('https://sandbox.api.otto.market/v3/receipts', { headers });
  console.log(`\nReceipts (GET /v3/receipts): ${receiptsRes.status}`);
  console.log(`Body:`, await receiptsRes.text());

  process.exit(0);
}
main().catch(console.error);
