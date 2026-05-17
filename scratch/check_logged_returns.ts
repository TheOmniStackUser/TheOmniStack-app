import { db } from '../src/db/client'
import { returnsLog, returnedItems } from '../src/db/schema'

async function main() {
  try {
    const logs = await db.select().from(returnsLog)
    console.log("--- Returns Log entries ---")
    logs.forEach(l => {
      console.log(`- ID: ${l.id}, Company: ${l.companyId}, Order: ${l.orderNumber}, Customer: ${l.customerName}, Scanned At: ${l.scannedAt}`)
    })

    const items = await db.select().from(returnedItems)
    console.log("\n--- Returned Items ---")
    items.forEach(i => {
      console.log(`- LogID: ${i.returnLogId}, SKU: ${i.skuOrProductName}, Qty: ${i.quantity}, Cond: ${i.condition}`)
    })

    process.exit(0)
  } catch (error) {
    console.error("DB Error:", error)
    process.exit(1)
  }
}

main()
