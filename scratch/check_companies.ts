import { db } from '../src/db/client'
import { companies } from '../src/db/schema/companies'

async function debug() {
  const all = await db.select().from(companies)
  console.log('--- Alle Firmen ---')
  all.forEach(c => {
    console.log(`ID: ${c.id}, Name: ${c.name}`)
  })
}

debug().catch(console.error)
