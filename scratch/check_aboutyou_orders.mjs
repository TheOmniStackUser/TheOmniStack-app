import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const dbOrders = await sql`
      SELECT id, status, marketplace_order_id, tracking_number, return_tracking_number, raw_payload, shipping_country 
      FROM orders 
      WHERE marketplace = 'aboutyou'
      LIMIT 10
    `
    console.log(`Found ${dbOrders.length} About You orders in DB:`)
    dbOrders.forEach(o => {
      console.log({
        id: o.id,
        status: o.status,
        marketplace_order_id: o.marketplace_order_id,
        tracking_number: o.tracking_number,
        return_tracking_number: o.return_tracking_number,
        shipping_country: o.shipping_country,
        hasRawPayload: !!o.raw_payload,
        rawShippingCountry: o.raw_payload?.shipping_country_code || o.raw_payload?.shipping?.country_code
      })
    })
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
