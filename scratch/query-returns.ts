import { db } from '../src/db/client'
import { returnsLog } from '../src/db/schema/returns'
import { desc } from 'drizzle-orm'

async function main() {
  const logs = await db.query.returnsLog.findMany({
    orderBy: [desc(returnsLog.scannedAt)],
    limit: 10,
    with: {
      items: true
    }
  })

  console.log('Recent returns log entries:')
  console.log(JSON.stringify(logs, null, 2))
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
