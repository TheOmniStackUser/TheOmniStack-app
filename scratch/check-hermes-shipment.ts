import { HermesAdapter } from '../src/adapters/shipping/hermes';

async function check() {
  try {
    const adapter = new HermesAdapter();
    const data = await adapter.getShipmentInfo('56126002089');
    console.log('--- HERMES SHIPMENT DATA ---');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error fetching shipment:', error);
  }
}

check();
