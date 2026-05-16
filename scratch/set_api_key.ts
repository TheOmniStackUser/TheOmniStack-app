import { db } from './src/db/client'
import { companies } from './src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function main() {
  const newKey = 'os_live_7747099a545449ec'
  await db.update(companies).set({ apiKey: newKey })
  console.log('API Key set to:', newKey)
  process.exit(0)
}

main()
