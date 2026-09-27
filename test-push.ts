import { db } from './src/db/client';
import { pushUpdatesToMarketplaces } from './src/workers/product-sync';

async function main() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb';
  const sku = 'Badehose-LuV-TS07-Rot-S'; // From user's screenshot (Decathlon item)

  const updates = [{
    sku,
    stock: 998,
    price: 29.90,
    msrp: 54.90
  }];

  console.log('Pushing updates...');
  const res = await pushUpdatesToMarketplaces(companyId, updates);
  console.log('Result:', res);
  
  process.exit(0);
}
main();
