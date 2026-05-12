import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { desc } from 'drizzle-orm'

async function debug() {
  const latest = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10)
  console.log('--- Die 10 neuesten Bestellungen ---')
  latest.forEach(o => {
    console.log(`ID: ${o.id}, Marktplatz: ${o.marketplace}, OrderID: ${o.marketplaceOrderId}, Status: ${o.status}, Erstellt: ${o.createdAt}`)
  })
}

debug().catch(console.error)
