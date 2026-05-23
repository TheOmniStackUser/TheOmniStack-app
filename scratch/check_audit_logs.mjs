import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const logs = await sql`
      SELECT id, company_id, action, next_state, created_at
      FROM audit_logs
      WHERE action = 'sync_error'
      ORDER BY created_at DESC
      LIMIT 10
    `
    console.log("Recent Sync Errors:", JSON.stringify(logs, null, 2))
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
