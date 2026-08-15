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
  
  const scope = [
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.finances'
  ].join(' ')
  
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(process.env.EBAY_CLIENT_ID + ':' + process.env.EBAY_CLIENT_SECRET).toString('base64')
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken) + '&scope=' + encodeURIComponent(scope)
  });
  
  const text = await tokenRes.text();
  console.log('Token response:', tokenRes.status, text);
  process.exit(0);
}
run();
