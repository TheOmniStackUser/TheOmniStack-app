import { db } from '../src/db/client'
import { companies } from '../src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function main() {
  const targetId = '3c8718d2-8738-4239-9481-56b6b16b85fb' // Leis & Leis GbR
  const newKey = 'os_live_leis_leis_gb_7747099a'
  
  try {
    await db.update(companies).set({ apiKey: newKey }).where(eq(companies.id, targetId))
    console.log(`Successfully set API Key for Leis & Leis GbR to: ${newKey}`)
    
    // Verify
    const [updated] = await db.select().from(companies).where(eq(companies.id, targetId)).limit(1)
    console.log("Verified API Key in DB:", updated.apiKey)
    process.exit(0)
  } catch (error) {
    console.error("Failed to set key:", error)
    process.exit(1)
  }
}

main()
