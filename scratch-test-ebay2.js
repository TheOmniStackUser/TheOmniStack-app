const postgres = require('postgres');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const integrations = await sql`SELECT refresh_token FROM marketplace_integrations WHERE type = 'ebay' AND refresh_token IS NOT NULL LIMIT 1`;
  
  if (integrations.length === 0) {
    console.log('No ebay integration found');
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
  
  // Lowercase
  const filter3 = `orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}`;
  const r3 = await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=' + encodeURIComponent(filter3), {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  
  console.log('Lowercase status:', r3.status);
  if (!r3.ok) console.log(await r3.text());
  else console.log('SUCCESS! Found', (await r3.json()).total, 'orders');
  
  process.exit(0);
}
run();
