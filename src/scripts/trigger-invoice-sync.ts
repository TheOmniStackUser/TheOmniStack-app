import { db } from "../db/client"
import { syncShippedOrdersInvoices } from "../workers/marketplace-sync"
import { companies } from "../db/schema/companies"

async function run() {
  console.log("Triggering invoice sync manually...")
  const allCompanies = await db.select().from(companies).limit(1);
  if (allCompanies.length === 0) {
    console.log("No companies found.");
    process.exit(1);
  }
  const companyId = allCompanies[0].id;
  await syncShippedOrdersInvoices(companyId)
  console.log("Invoice sync triggered")
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
