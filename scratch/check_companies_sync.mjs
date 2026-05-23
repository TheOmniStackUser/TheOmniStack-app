import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const companies = await sql`
      SELECT id, name, fetch_orders_daily, fetch_orders_time, fetch_orders_marketplaces
      FROM companies
    `
    console.log("Companies:", JSON.stringify(companies, null, 2))
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
