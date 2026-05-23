import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const orders = await sql`
      SELECT id, marketplace_order_id, raw_payload
      FROM orders 
      WHERE marketplace = 'aboutyou'
    `
    console.log(`Checking carrier_key in ${orders.length} orders:`)
    orders.forEach(o => {
      console.log(`Order ${o.marketplace_order_id}: carrier_key = ${o.raw_payload?.carrier_key}, shipping_country_code = ${o.raw_payload?.shipping_country_code}`)
    })
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
