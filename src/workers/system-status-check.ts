import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { db } from '@/db/client'
import { systemStatusDaily, systemServicesEnum, systemIncidents } from '@/db/schema/system-status'
import { eq, isNull, and, or, lte, gte } from 'drizzle-orm'

const connection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
})

export const systemStatusQueue = new Queue('system-status-check', {
  connection,
})

// Worker that runs every 15 minutes to check system status
export const systemStatusWorker = new Worker(
  'system-status-check',
  async (job) => {
    console.log(`[SystemStatus] Running periodic check...`)
    
    // In a real scenario, you might ping actual health check URLs here.
    // For now, we determine the "auto" status based on whether there are active incidents.
    
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    
    // Find active incidents that would cause downtime
    // An incident causes downtime if it's 'investigating' or 'identified', 
    // or if it's 'maintenance' and currently within the maintenance window.
    const activeIncidents = await db.query.systemIncidents.findMany({
      where: or(
        eq(systemIncidents.status, 'investigating'),
        eq(systemIncidents.status, 'identified'),
        and(
          eq(systemIncidents.status, 'maintenance'),
          lte(systemIncidents.startTime, now),
          or(isNull(systemIncidents.endTime), gte(systemIncidents.endTime, now))
        )
      )
    })
    
    const downServices = new Set(activeIncidents.map(i => i.service))
    
    for (const service of systemServicesEnum.enumValues) {
      const isDown = downServices.has(service)
      const statusValue: 1 | 0 = isDown ? 0 : 1
      
      // Upsert today's record for this service
      const existingRecord = await db.query.systemStatusDaily.findFirst({
        where: and(
          eq(systemStatusDaily.service, service),
          eq(systemStatusDaily.date, today)
        )
      })
      
      if (existingRecord) {
        // Append the new status to the array
        const currentData = (existingRecord.uptimeData as number[]) || []
        currentData.push(statusValue)
        
        await db.update(systemStatusDaily)
          .set({ uptimeData: currentData })
          .where(eq(systemStatusDaily.id, existingRecord.id))
      } else {
        // Create new record for today
        await db.insert(systemStatusDaily).values({
          service,
          date: today,
          uptimeData: [statusValue]
        })
      }
    }
    
    console.log(`[SystemStatus] Check complete. Logged status for ${systemServicesEnum.enumValues.length} services.`)
  },
  { connection }
)

systemStatusWorker.on('failed', (job, err) => {
  console.error(`[SystemStatus] Job failed: ${err?.message}`)
})
