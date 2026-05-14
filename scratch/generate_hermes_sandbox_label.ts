import { HermesAdapter } from '../src/adapters/shipping/hermes';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('[Test Script] Starte Label-Generierung in der Sandbox...');
  
  // Sandbox-Credentials (aus der Historie)
  const username = 'testkunde3';
  const password = 'ewrfn:gN';
  
  const adapter = new HermesAdapter(null, null, username, password);
  
  // Override App Credentials and Auth URL for Sandbox
  (adapter as any).appId = 'hsi.int.verm.theomnistack';
  (adapter as any).appSecret = 'ZRLD4LtrD8vDihgieheT';
  (adapter as any).authUrl = 'https://authme-int.myhermes.de/authorization-facade/oauth2/access_token';
  (adapter as any).baseUrl = 'https://de-api-int.hermesworld.com';

  // Manuelle Konfiguration für Sandbox setzen
  adapter.setConfig({
    environment: 'sandbox',
    platformReturns: {
      otto: 'enclosed'
    }
  });

  // Dummy-Bestellung für den Test
  const dummyOrder: any = {
    id: 'dummy-id-' + Date.now(),
    orderNumber: 'TEST-' + Date.now(),
    marketplace: 'otto',
    shippingName: 'Maximilian Mustermann',
    shippingStreet: 'Essener Str. 89',
    shippingHouseNo: '89',
    shippingZip: '22419',
    shippingCity: 'Hamburg',
    shippingCountry: 'DE',
    customerEmail: 'test@example.com'
  };

  const company: any = {
    name: 'TheOmniStack GmbH',
    street: 'Musterstraße 1',
    zip: '12345',
    city: 'Berlin',
    country: 'DE'
  };

  const returnAddress: any = {
    street: 'Essener Str.',
    houseNo: '89',
    zipCode: '22419',
    city: 'Hamburg',
    countryCode: 'DEU'
  };

  const returnName: any = {
    name1: 'Hermes Logistik Gruppe Deutschland'
  };

  // Override generateLabelForOrder internal payload logic via prototype if needed? 
  // No, I'll just change the adapter call to pass these.
  // Wait, I'll just modify the adapter code temporarily to use these if it's sandbox.

  try {
    const result = await adapter.generateLabelForOrder(dummyOrder, company);
    
    console.log('[Test Script] Labels erfolgreich generiert!');
    console.log('Versand-Tracking:', result.trackingNumber);
    console.log('Retouren-Tracking:', result.returnTrackingNumber);

    const targetDir = './scratch/';
    
    if (result.labelUrl) {
      const base64Data = result.labelUrl.split(',')[1];
      const fileName = `Hermes_Versandlabel_Sandbox_${dummyOrder.orderNumber}.pdf`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      console.log('Gespeichert:', filePath);
    }

    if (result.returnLabelUrl) {
      const base64Data = result.returnLabelUrl.split(',')[1];
      const fileName = `Hermes_Retourenlabel_Sandbox_${dummyOrder.orderNumber}.pdf`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      console.log('Gespeichert:', filePath);
    }

  } catch (error) {
    console.error('[Test Script] Fehler bei der Generierung:', error);
  }
}

run().catch(console.error);
