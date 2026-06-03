import { db } from '../src/db/client'
import { companyMembers, companies } from '../src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function run() {
  console.log('Testing DB connection...')
  const lookupKey = 'os_live_leis_leis_gb_7747099a' // this is from the code
  const [member] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.apiKey, lookupKey))
    .limit(1)

  console.log('Member:', member)
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
