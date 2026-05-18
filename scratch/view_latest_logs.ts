import { db } from '../src/db/client'
import { returnsLog } from '../src/db/schema/returns'
import { desc } from 'drizzle-orm'

async function check() {
  const logs = await db.select().from(returnsLog).orderBy(desc(returnsLog.scannedAt)).limit(10)
  console.log('--- Last 10 Return Logs ---')
  logs.forEach(log => {
    console.log(JSON.stringify(log, null, 2))
  })
}

check().catch(console.error)
