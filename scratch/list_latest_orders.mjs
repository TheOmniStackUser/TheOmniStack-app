import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const dbOrders = await sql`
      SELECT id, marketplace, marketplace_order_id, status, tracking_number, invoice_id, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `
    console.log(`Latest 10 orders in DB:`)
    console.log(dbOrders)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
