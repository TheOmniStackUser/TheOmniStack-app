import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { AmazonAdapter } from './src/adapters/marketplace/amazon';

async function main() {
  const m = await db.query.marketplaceIntegrations.findFirst({
    where: (integrations, { eq, and }) => and(eq(integrations.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb'), eq(integrations.type, 'amazon'))
  });
  if (!m) return console.log('no amazon integration');
  
  const adapter = new AmazonAdapter(m.metadata as any);
  const token = await adapter['getAccessToken']();
  const sellerId = (m.metadata as any).sellerId;
  const sku = 'AM-AMWB2401-Schwarz-36'; // Example SKU
  
  console.log(`Testing PATCH /listings/2021-08-01/items/${sellerId}/${sku}`);
  
  const payload = {
    productType: "PRODUCT",
    patches: [
      {
        op: "replace",
        path: "/attributes/fulfillment_availability",
        value: [
          {
            fulfillment_channel_code: "DEFAULT",
            quantity: 999
          }
        ]
      }
    ]
  };

  const res = await fetch(`https://sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/${sellerId}/${sku}?marketplaceIds=A1PA6795UKMFR9`, {
    method: 'PATCH',
    headers: {
      'x-amz-access-token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${await res.text()}`);
  process.exit(0);
}
main();
