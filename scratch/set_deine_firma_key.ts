import { db } from '../src/db/client'
import { companies } from '../src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function main() {
  const targetId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa' // Deine Firma
  const newKey = 'os_live_deine_firma_7747099a'
  
  try {
    await db.update(companies).set({ apiKey: newKey }).where(eq(companies.id, targetId))
    console.log(`Successfully set API Key for Deine Firma to: ${newKey}`)
    
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
