const postgres = require('postgres');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const integrations = await sql`SELECT refresh_token FROM marketplace_integrations WHERE type = 'ebay' AND refresh_token IS NOT NULL LIMIT 1`;
  
  if (integrations.length === 0) {
    console.log('No ebay integration found with refresh token');
    process.exit(1);
  }
  
  const refreshToken = integrations[0].refresh_token;
  
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(process.env.EBAY_CLIENT_ID + ':' + process.env.EBAY_CLIENT_SECRET).toString('base64')
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
  });
  
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  
  console.log('Got Access Token:', !!accessToken);
  if (!accessToken) {
    console.log(tokenData);
    process.exit(1);
  }
  
  // Test 1: with .000Z
  const defaultFromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + '.000Z';
  const filter1 = `orderFulfillmentStatus:{NOT_STARTED|IN_PROGRESS},creationdate:[${defaultFromDate}..]`;
  console.log('Testing Filter 1:', filter1);
  
  const r1 = await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=' + encodeURIComponent(filter1), {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  
  console.log('Test 1 (.000Z) status:', r1.status);
  if (!r1.ok) console.log(await r1.text());
  else console.log('Test 1 SUCCESS! Found', (await r1.json()).total, 'orders');
  
  // Test 2: Just YYYY-MM-DD
  const filter2 = `orderFulfillmentStatus:{NOT_STARTED|IN_PROGRESS},creationdate:[2024-01-01T00:00:00.000Z..]`;
  console.log('Testing Filter 2:', filter2);
  const r2 = await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=' + encodeURIComponent(filter2), {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  
  console.log('Test 2 (Hardcoded) status:', r2.status);
  if (!r2.ok) console.log(await r2.text());
  else console.log('Test 2 SUCCESS! Found', (await r2.json()).total, 'orders');
  
  // Test 3: No creationdate at all (eBay says it's optional? Let's check)
  const filter3 = `orderFulfillmentStatus:{NOT_STARTED|IN_PROGRESS}`;
  console.log('Testing Filter 3:', filter3);
  const r3 = await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=' + encodeURIComponent(filter3), {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  
  console.log('Test 3 (No creationdate) status:', r3.status);
  if (!r3.ok) console.log(await r3.text());
  else console.log('Test 3 SUCCESS! Found', (await r3.json()).total, 'orders');
  
  process.exit(0);
}
run();
