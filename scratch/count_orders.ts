import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { sql } from 'drizzle-orm'

async function debug() {
  const [{ count }] = await db.select({ count: sql`count(*)` }).from(orders)
  console.log(`Gesamtzahl Bestellungen: ${count}`)
  
  const allOrders = await db.select().from(orders).limit(5)
  console.log('--- Rohdaten (erste 5) ---')
  console.log(JSON.stringify(allOrders, null, 2))
}

debug().catch(console.error)
