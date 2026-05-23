import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const results = await sql`
      SELECT id, marketplace, marketplace_order_id, buyer_name, status, tracking_number, invoice_id, created_at
      FROM orders
      WHERE buyer_name ILIKE '%Christine%' OR buyer_name ILIKE '%Ruschke%'
    `
    console.log('Search Results by Buyer Name:')
    console.log(results)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
