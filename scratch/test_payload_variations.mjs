import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const [order] = await sql`
      SELECT id, tracking_number, return_tracking_number, raw_payload, company_id
      FROM orders 
      WHERE id = 'fad98f8b-7030-4630-8f26-7e40260fdcf7'
    `
    const [integration] = await sql`
      SELECT api_key 
      FROM marketplace_integrations 
      WHERE type = 'aboutyou' AND company_id = ${order.company_id} AND is_active = true
      LIMIT 1
    `
    const apiKey = integration.api_key
    const rawOrder = order.raw_payload
    const orderItemIds = rawOrder.order_items.map(item => item.order_item_id || item.id)

    const baseShipment = {
      order_items: orderItemIds,
      carrier_key: 'HERMES_KLV',
      shipment_tracking_key: order.tracking_number,
      return_tracking_key: order.return_tracking_number || ""
    }

    const variations = [
      {
        name: "Standard structure (nested items in data)",
        body: {
          data: {
            items: [baseShipment]
          }
        }
      },
      {
        name: "Plain items structure (no data wrapper)",
        body: {
          items: [baseShipment]
        }
      },
      {
        name: "Data as array of shipments",
        body: {
          data: [baseShipment]
        }
      },
      {
        name: "Direct shipment payload (no items/data wrapper)",
        body: baseShipment
      }
    ]

    for (const v of variations) {
      console.log(`\n--- Testing variation: ${v.name} ---`)
      console.log("Payload:", JSON.stringify(v.body, null, 2))
      
      const res = await fetch('https://partner.aboutyou.com/api/v1/orders/ship', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(v.body)
      })
      
      console.log(`Status: ${res.status}`)
      const text = await res.text()
      console.log(`Response: ${text}`)
    }
    
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
