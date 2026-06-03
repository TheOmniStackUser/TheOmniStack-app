import { db } from '../src/db/client'
import { companyMembers, companies } from '../src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function run() {
  const lookupKey = 'os_live_leis_leis_gb_7747099a'
  console.log('Querying member...')
  const [member] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.apiKey, lookupKey))
    .limit(1)
  console.log('Member:', member)

  if (member) {
    const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, member.companyId)).limit(1)
    console.log('Company Name:', c?.name)
  }
}
run().catch(console.error).then(() => process.exit(0))
