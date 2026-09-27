import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';

async function main() {
  const m = await db.query.marketplaceIntegrations.findFirst({
    where: (integrations, { eq, and }) => and(eq(integrations.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb'), eq(integrations.type, 'otto'))
  });
  if (!m) return;
  
  const devToken = m.accessToken; // developer token
  const installTokenUrl = `https://api.otto.market/v1/apps/${m.metadata.appId}/installations/${m.metadata.installationId}/accessToken`;
  
  // Try with 'pricing' scope
  const scopesToTry = [
    'orders products shipments returns receipts availability price-reduction pricing',
    'orders products shipments returns receipts availability price-reduction prices',
    'orders products shipments returns receipts availability price-reduction product-prices'
  ];

  for (const scope of scopesToTry) {
    console.log(`Testing scope: ${scope}`);
    const installResponse = await fetch(installTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${devToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scope
      }).toString()
    });
    
    if (installResponse.ok) {
      console.log(`Success with scope: ${scope}`);
      const data = await installResponse.json();
      console.log('Got token!');
      
      // Test the token
      const res = await fetch(`https://api.otto.market/v5/products/prices?limit=1`, {
        headers: { 'Authorization': `Bearer ${data.access_token}` }
      });
      console.log(`GET /v5/products/prices returned: ${res.status}`);
      break;
    } else {
      console.log(`Failed: ${installResponse.status} - ${await installResponse.text()}`);
    }
  }
  
  process.exit(0);
}
main();
