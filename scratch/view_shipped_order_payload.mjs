import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const [order] = await sql`
      SELECT raw_payload 
      FROM orders 
      WHERE id = 'fad98f8b-7030-4630-8f26-7e40260fdcf7'
    `
    console.log("Raw Payload:", JSON.stringify(order.raw_payload, null, 2))
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
