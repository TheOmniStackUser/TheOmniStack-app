import { db } from '../src/db/client'
import { companies } from '../src/db/schema/companies'

async function main() {
  try {
    const allCompanies = await db.select().from(companies)
    console.log("All Companies & Keys:")
    allCompanies.forEach(c => {
      console.log(`- ID: ${c.id}, Name: ${c.name}, Legal: ${c.legalName}, API Key: ${c.apiKey}`)
    })
    process.exit(0)
  } catch (error) {
    console.error("DB Error:", error)
    process.exit(1)
  }
}

main()
