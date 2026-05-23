import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    console.log('Running migration: ALTER TABLE "companies" ADD COLUMN "document_number_settings" jsonb;')
    await sql`ALTER TABLE "companies" ADD COLUMN "document_number_settings" jsonb`
    console.log('Migration ran successfully!')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

main()
