import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { systemStatusDaily, systemServicesEnum, systemIncidents } from '@/db/schema/system-status'
import { eq, isNull, and, or, lte, gte } from 'drizzle-orm'

export async function GET(req: Request) {
  // Optional: check Authorization header if Vercel Cron secures the endpoint
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  console.log(`[SystemStatus] Running Vercel periodic check...`)
  
  try {
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    
    // Find active incidents that would cause downtime
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
      
      const existingRecord = await db.query.systemStatusDaily.findFirst({
        where: and(
          eq(systemStatusDaily.service, service),
          eq(systemStatusDaily.date, today)
        )
      })
      
      if (existingRecord) {
        const currentData = (existingRecord.uptimeData as number[]) || []
        currentData.push(statusValue)
        
        await db.update(systemStatusDaily)
          .set({ uptimeData: currentData })
          .where(eq(systemStatusDaily.id, existingRecord.id))
      } else {
        await db.insert(systemStatusDaily).values({
          service,
          date: today,
          uptimeData: [statusValue]
        })
      }
    }
    
    return NextResponse.json({ success: true, loggedServices: systemServicesEnum.enumValues.length })
  } catch (error: any) {
    console.error(`[SystemStatus] Cron failed: ${error.message}`)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
