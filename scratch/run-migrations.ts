import { db } from '../src/db/client'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

async function run() {
  console.log('Starting migrations...')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('Migrations applied successfully!')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
