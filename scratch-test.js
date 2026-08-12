const postgres = require('postgres');

async function run() {
  const sql = postgres({
    host: 'ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech',
    port: 5432,
    database: 'neondb',
    username: 'neondb_owner',
    password: '!ha1860a81234CVs$%',
    ssl: 'require'
  });
  
  try {
    console.log('Connected to DB');
    
    // Get eBay integration
    const integrations = await sql`SELECT * FROM marketplace_integrations WHERE type = 'ebay' AND is_active = true LIMIT 1`;
    if (integrations.length === 0) {
      console.log('No eBay integration found');
      return;
    }
    const integration = integrations[0];
    console.log('Found integration for company:', integration.company_id);
    console.log('Access token starts with:', integration.access_token.substring(0, 15) + '...');
    
    // Let's use this access token to call eBay API
    const baseUrl = 'https://api.ebay.com';
    let filter = 'orderFulfillmentStatus:{NOT_STARTED|IN_PROGRESS}';
    // filter += ',creationdate:[2026-08-01T00:00:00.000Z..]'; // uncomment to test date filter
    
    const endpoint = `${baseUrl}/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=100`;
    console.log('Fetching:', endpoint);
    
    const ebayRes = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const text = await ebayRes.text();
    console.log('eBay Status:', ebayRes.status);
    console.log('eBay Response:', text.substring(0, 500));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

run();
