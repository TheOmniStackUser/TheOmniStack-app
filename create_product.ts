import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, and } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function main() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: and(
      eq(marketplaceIntegrations.companyId, '549c1c0b-0d32-42b7-912f-0c1198d6d67e'),
      eq(marketplaceIntegrations.type, 'otto')
    )
  });

  if (!integration) throw new Error('Integration not found');

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: integration.environment as any,
    installationId: (integration.metadata as any)?.installationId,
    appId: (integration.metadata as any)?.appId,
    connectionType: 'service_partner'
  });

  const token = await adapter['getAccessToken']();

  const productPayload = [
    {
      "sku": "Gürtel-F0050-110",
      "ean": "4250848500309",
      "productReference": "Herrengürtel Herren Leder Gürtel F0050",
      "productDescription": {
        "brandId": "O6BLU7MS",
        "category": "Ledergürtel",
        "description": "Entdecke den eleganten Herren Ledergürtel von GUGGEN MOUNTAIN. Mit hochwertiger Verarbeitung und einer komfortablen Schnalle ist dieser Gürtel nicht nur ein praktisches Accessoire, sondern auch ein stilvolles Statement. Erhältlich in Schwarz, passt er perfekt zu einer Vielzahl von Outfits und Anlässen. Gönne dir jetzt diesen vielseitigen und strapazierfähigen Gürtel!",
        "productLine": "Herren Gürtel Leder Herrengürtel F0050 Hochwertige Schnalle",
        "bulletPoints": [
          "Hochwertiges Material: Der GUGGEN Mountain Ledergürtel für Herren besteht aus echtem Leder, das Strapazierfähigkeit und Langlebigkeit garantiert.",
          "Stilvolles Design: Mit seiner hochwertigen Schnalle und dem zeitlosen Schwarz ist dieser Gürtel ein elegantes Accessoire, das jeden Look komplettiert.",
          "Komfortabler Sitz: Der Gürtel bietet dank seiner verstellbaren Länge und der angenehmen Passform einen hohen Tragekomfort, ideal für den täglichen Gebrauch.",
          "Vielseitige Verwendung: Ob zur Jeans oder Anzughose, dieser Gürtel passt zu verschiedenen Outfits und Anlässen, sowohl im Alltag als auch zu besonderen Anlässen.",
          "Praktisches Geschenk: Der GUGGEN Mountain Ledergürtel ist auch eine ideale Geschenkidee für stilbewusste Männer, die Wert auf Qualität und Eleganz legen."
        ],
        "attributes": [
          {"name": "Anlässe", "values": ["Abendmode", "Arbeitsmode", "Basic", "Businessmode", "Casualmode", "Festival", "Festtagsmode", "Frühlingsmode", "Hochzeitsmode", "Herbstmode", "Partymode", "Outdoormode", "Wintermode", "Sommermode"]},
          {"name": "Ausgabegröße", "values": ["110"]},
          {"name": "Farbe", "values": ["Schwarz"]},
          {"name": "Geschlecht", "values": ["männlich"]},
          {"name": "Grundfarbe", "values": ["schwarz"]},
          {"name": "Gürtelgrößen", "values": ["110", "115", "120", "125", "130", "135"]},
          {"name": "Materialzusammensetzung", "values": ["100% Leder"]},
          {"name": "Stil", "values": ["casual", "modisch", "sportlich"]},
          {"name": "Zielgruppe", "values": ["Erwachsene"]},
          {"name": "Besondere Merkmale", "values": ["Komfortabler Gürtel Jeansgürtel Schwarz"]},
          {"name": "Material Schließe", "values": ["Metall"]},
          {"name": "Materialeigenschaften", "values": ["elastisch"]}
        ]
      },
      "pricing": {
        "standardPrice": {
          "amount": 39.9,
          "currency": "EUR"
        },
        "sale": {
          "salePrice": {
            "amount": 29.67,
            "currency": "EUR"
          },
          "startDate": "2026-06-10T00:00:00.000Z",
          "endDate": "2055-08-24T21:59:59.000Z"
        },
        "vat": "FULL",
        "msrp": {
          "amount": 39.9,
          "currency": "EUR"
        }
      },
      "delivery": {
        "type": "PARCEL",
        "deliveryTime": 5
      },
      "mediaAssets": [
        {
          "type": "IMAGE",
          "filename": "F0050v2.jpg",
          "location": "https://m.media-amazon.com/images/I/71R2c3s7sDL._AC_SY695_.jpg"
        }
      ],
      "compliance": {
        "productSafety": {
          "addresses": [
            {
              "roles": ["DISTRIBUTOR"],
              "name": "F&L Fashion GmbH",
              "address": "Musterstraße 1, 20095, Hamburg, Deutschland",
              "regionCode": "DE",
              "email": "kontakt@f-l-fashion.de"
            }
          ]
        }
      }
    }
  ];

  console.log('Sending payload...', JSON.stringify(productPayload, null, 2));

  const res = await fetch('https://sandbox.api.otto.market/v5/products', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(productPayload)
  });

  const data = await res.json();
  console.log('Product Creation Status:', res.status, JSON.stringify(data, null, 2));

  if (data.links && data.links.length > 0) {
     console.log('Waiting 10 seconds for validation...');
     await new Promise(r => setTimeout(r, 10000));
     const failedLink = data.links.find((l: any) => l.rel === 'failed');
     const succeededLink = data.links.find((l: any) => l.rel === 'succeeded');
     
     if (failedLink) {
        const url = failedLink.href.startsWith('http') ? failedLink.href : `https://sandbox.api.otto.market${failedLink.href}`;
        const failRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token }});
        console.log('Validation Failures:', JSON.stringify(await failRes.json(), null, 2));
     }
     
     if (succeededLink) {
        const url = succeededLink.href.startsWith('http') ? succeededLink.href : `https://sandbox.api.otto.market${succeededLink.href}`;
        const succRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token }});
        console.log('Validation Success:', JSON.stringify(await succRes.json(), null, 2));
     }
  }

  process.exit(0);
}

main();
