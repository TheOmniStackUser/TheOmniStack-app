
import fs from 'fs';

async function generateHermesReturnLabel() {
  const credentials = {
    appId: 'hsi.int.verm.theomnistack',
    appSecret: 'ZRLD4LtrD8vDihgieheT',
    username: 'testkunde3',
    password: 'ewrfn:gN'
  };

  const authUrl = 'https://authme.myhermes.de/authorization-facade/oauth2/access_token';
  const baseUrl = 'https://de-api.hermesworld.com';

  console.log('--- Hermes INT Return Label Generation ---');
  console.log('1. Getting Access Token...');

  try {
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: credentials.appId,
        client_secret: credentials.appSecret,
        username: credentials.username,
        password: credentials.password
      })
    });

    if (!authResponse.ok) {
      const errText = await authResponse.text();
      throw new Error(`Auth Failed: ${authResponse.status} - ${errText}`);
    }

    const authData = await authResponse.json() as any;
    const token = authData.access_token;
    console.log('   Token received successfully.');

    console.log('2. Generating Label with Return Service...');

    // Dummy data for the test label
    const payload = {
      clientReference: 'INT-TEST-' + Date.now().toString().slice(-6),
      receiverName: {
        firstname: 'Max',
        lastname: 'Mustermann'
      },
      receiverAddress: {
        street: 'Essener Str.',
        houseNumber: '2',
        zipCode: '22419',
        town: 'Hamburg',
        countryCode: 'DE'
      },
      senderName: {
        firstname: 'TheOmniStack',
        lastname: 'Test Account'
      },
      senderAddress: {
        street: 'Musterstraße',
        houseNumber: '1',
        zipCode: '50667',
        town: 'Köln',
        countryCode: 'DE'
      },
      parcel: {
        parcelWeight: 1500,
        parcelClass: 'S',
        parcelVolume: 50,
        productType: 'PARCEL'
      },
      service: {
        returnService: {
          returnReceiverName: {
            name1: 'TheOmniStack Returns'
          },
          returnReceiverAddress: {
            street: 'Musterstraße',
            houseNumber: '1',
            zipCode: '50667',
            town: 'Köln',
            countryCode: 'DE'
          },
          returnProductType: 'PARCEL',
          returnServiceType: 'RETURN'
        }
      }
    };

    const labelResponse = await fetch(`${baseUrl}/services/hsi/shipmentorders/labels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/shippinglabel-pdf+json'
      },
      body: JSON.stringify(payload)
    });

    if (!labelResponse.ok) {
      const errText = await labelResponse.text();
      throw new Error(`Label Generation Failed: ${labelResponse.status} - ${errText}`);
    }

    const labelData = await labelResponse.json() as any;
    
    // Fallback for different response structures
    const shipmentId = labelData.shipmentID || labelData.shipmentOrder?.shipmentID || labelData.barcode;
    const returnShipmentId = labelData.returnShipmentID || labelData.shipmentOrder?.returnShipmentID || 
                             (labelData.shipmentOrder?.returnShipments?.[0]?.shipmentID) ||
                             (labelData.returnShipments?.[0]?.shipmentID);

    console.log('--- SUCCESS ---');
    console.log('Shipment ID:', shipmentId);
    console.log('Return Shipment ID:', returnShipmentId);

    const base64Outbound = labelData.labelImage || labelData.shipmentOrder?.labelImage;
    const rawReturnImage = labelData.returnLabelImage || labelData.shipmentOrder?.returnLabelImage || 
                           (labelData.returnShipments?.[0]?.labelImage) || 
                           (labelData.shipmentOrder?.returnShipments?.[0]?.labelImage);
    
    const base64Return = Array.isArray(rawReturnImage) ? rawReturnImage[0] : rawReturnImage;

    if (base64Outbound) {
      fs.writeFileSync('scratch/hermes_outbound_test.pdf', Buffer.from(base64Outbound, 'base64'));
      console.log('Saved: scratch/hermes_outbound_test.pdf');
    }

    if (base64Return) {
      fs.writeFileSync('scratch/hermes_return_test.pdf', Buffer.from(base64Return, 'base64'));
      console.log('Saved: scratch/hermes_return_test.pdf');
    } else {
      console.log('WARNING: No Return Label Image found in response.');
      console.log('Full Response Keys:', Object.keys(labelData));
      if (labelData.shipmentOrder) console.log('ShipmentOrder Keys:', Object.keys(labelData.shipmentOrder));
    }

  } catch (error) {
    console.error('--- ERROR ---');
    console.error(error);
  }
}

generateHermesReturnLabel();
