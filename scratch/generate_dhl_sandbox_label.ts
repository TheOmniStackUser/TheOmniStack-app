import fs from 'fs';
import path from 'path';

async function run() {
  console.log('[Test Script] Starte DHL Label-Generierung in der Sandbox...');

  // Fallback API Key check from env
  const apiKey = process.env.DHL_API_KEY;
  if (!apiKey) {
    console.error('FEHLER: Bitte stelle sicher, dass DHL_API_KEY in deiner .env.local eingetragen ist, oder übergebe ihn als Umgebungsvariable.');
    process.exit(1);
  }

  // Predefined Sandbox Credentials (öffentlich zugängliche Test-Daten von DHL)
  const username = 'user-valid';
  const password = 'SandboxPasswort2023!';
  const billingNumber = '22222222220101'; // V01PAK Abrechnungsnummer für Sandbox
  const returnBillingNumber = '22222222220701'; // V07PAK Retouren-Abrechnungsnummer für Sandbox

  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
  const baseUrl = 'https://api-sandbox.dhl.com/parcel/de/shipping/v2';

  const shipmentPayload = {
    profile: 'STANDARD_GRUPPENPROFIL',
    combinedPrinting: false,
    shipments: [{
      product: 'V01PAK',
      billingNumber: billingNumber,
      refNo: 'SANDBOX-DHL-' + Date.now().toString().slice(-8),
      shipper: {
        name1: 'TheOmniStack GmbH',
        addressStreet: 'Hauptstraße',
        addressHouse: '12a',
        postalCode: '53113',
        city: 'Bonn',
        country: 'DEU',
      },
      consignee: {
        name1: 'Maximilian Mustermann',
        addressStreet: 'Musterweg',
        addressHouse: '42',
        postalCode: '50667',
        city: 'Köln',
        country: 'DEU',
      },
      details: {
        weight: { uom: 'kg', value: 1.5 },
      },
      services: {
        dhlRetoure: {
          billingNumber: returnBillingNumber,
          returnAddress: {
            name1: 'TheOmniStack GmbH',
            addressStreet: 'Hauptstraße',
            addressHouse: '12a',
            postalCode: '53113',
            city: 'Bonn',
            country: 'DEU',
          }
        }
      }
    }],
  };

  console.log(`[Test Script] Sende Request an DHL Sandbox...`);

  try {
    const response = await fetch(`${baseUrl}/orders?labelFormat=PDF`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'dhl-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(shipmentPayload),
    });

    const responseText = await response.text();
    console.log(`[Test Script] Response Status: ${response.status}`);

    if (!response.ok) {
      console.error(`[Test Script] DHL API Fehler: HTTP ${response.status}`, responseText);
      return;
    }

    const data = JSON.parse(responseText);
    const shipment = data.items?.[0];

    if (!shipment) {
      console.error('[Test Script] Kein Sendungsobjekt in Antwort vorhanden.');
      return;
    }

    const trackingNumber = shipment.shipmentTrackingNumber || shipment.shipmentNumber || '';
    const returnTrackingNumber = shipment.returnShipmentTrackingNumber || '';

    console.log(`[Test Script] Versand-Tracking: ${trackingNumber}`);
    console.log(`[Test Script] Retouren-Tracking: ${returnTrackingNumber}`);

    const targetDir = './scratch/';

    // Save Outbound Label
    const labelB64 = shipment.label?.b64;
    if (labelB64) {
      const fileName = `dhl_test_label_national_${trackingNumber || 'outbound'}.pdf`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(labelB64, 'base64'));
      console.log(`✅ Versandetikett erfolgreich gespeichert: ${filePath}`);
    } else {
      console.warn('[Test Script] Kein Versand-PDF in Antwort (label.b64 fehlt).');
    }

    // Save Return Label
    const returnLabelB64 = shipment.returnLabel?.b64;
    if (returnLabelB64) {
      const fileName = `dhl_test_label_retoure_${returnTrackingNumber || 'return'}.pdf`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(returnLabelB64, 'base64'));
      console.log(`✅ Retourenlabel erfolgreich gespeichert: ${filePath}`);
    } else {
      console.warn('[Test Script] Kein Retouren-PDF in Antwort (returnLabel.b64 fehlt).');
    }

  } catch (error) {
    console.error('[Test Script] Fehler bei der Ausführung:', error);
  }
}

run().catch(console.error);
