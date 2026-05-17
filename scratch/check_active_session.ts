import { db } from '../src/db/client'
import { sessions, users } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  try {
    const allSessions = await db.select().from(sessions)
    console.log("--- Active Sessions ---")
    allSessions.forEach(s => {
      console.log(`- SessionID: ${s.id}, UserID: ${s.userId}, Active Company: ${s.activeCompanyId}, Expires: ${s.expiresAt}`)
    })
    process.exit(0)
  } catch (error) {
    console.error("DB Error:", error)
    process.exit(1)
  }
}

main()
