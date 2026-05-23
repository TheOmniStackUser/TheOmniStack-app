import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const results = await sql`
      SELECT id, marketplace, marketplace_order_id, status, tracking_number, invoice_id, created_at
      FROM orders
      WHERE id = 'bc4d4ac1-ba8e-4503-a7a2-537901c69b2a' 
         OR marketplace_order_id = 'cbn4xr86sv'
         OR marketplace_order_id = 'bc4d4ac1-ba8e-4503-a7a2-537901c69b2a'
    `
    console.log('Search Results:')
    console.log(results)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
