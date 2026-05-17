import { db } from '../src/db/client'
import { users, companyMembers, companies } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  try {
    // 1. List users
    const allUsers = await db.select().from(users)
    console.log("--- Users ---")
    allUsers.forEach(u => {
      console.log(`- ID: ${u.id}, Email: ${u.email}`)
    })

    // 2. List company memberships
    const memberships = await db.select().from(companyMembers)
    console.log("\n--- Memberships ---")
    memberships.forEach(m => {
      console.log(`- User: ${m.userId}, Company: ${m.companyId}, Role: ${m.role}`)
    })

    process.exit(0)
  } catch (error) {
    console.error("DB Error:", error)
    process.exit(1)
  }
}

main()
