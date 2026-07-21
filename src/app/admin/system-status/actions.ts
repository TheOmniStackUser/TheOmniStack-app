'use server'

import { db } from '@/db/client'
import { systemIncidents, systemServicesEnum, incidentStatusEnum } from '@/db/schema/system-status'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function getAdminIncidents() {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support') {
    throw new Error('Unauthorized')
  }

  const incidents = await db.query.systemIncidents.findMany({
    orderBy: [desc(systemIncidents.createdAt)]
  })

  return incidents
}

export async function createIncident(data: {
  service: typeof systemServicesEnum.enumValues[number]
  title: string
  description?: string
  status: typeof incidentStatusEnum.enumValues[number]
  startTime?: Date
  endTime?: Date
}) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support') {
    throw new Error('Unauthorized')
  }

  await db.insert(systemIncidents).values({
    service: data.service,
    title: data.title,
    description: data.description || null,
    status: data.status,
    startTime: data.startTime || new Date(),
    endTime: data.endTime || null,
  })

  revalidatePath('/status')
  revalidatePath('/admin/system-status')
}

export async function resolveIncident(id: string) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support') {
    throw new Error('Unauthorized')
  }

  await db.update(systemIncidents)
    .set({
      status: 'resolved',
      endTime: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(systemIncidents.id, id))

  revalidatePath('/status')
  revalidatePath('/admin/system-status')
}

export async function getOverrideStatuses() {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support') {
    throw new Error('Unauthorized')
  }

  const overridesRows = await db.query.systemStatusOverride.findMany()
  const overrides: Record<string, string> = {}
  for (const o of overridesRows) {
    overrides[o.service] = o.status
  }

  // Get current automatic status for all services for today
  const { systemStatusDaily, systemServicesEnum } = await import('@/db/schema/system-status')
  const { gte } = await import('drizzle-orm')
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const uptimeRows = await db.query.systemStatusDaily.findMany({
    where: gte(systemStatusDaily.date, today)
  })

  const autoStatus: Record<string, boolean> = {}
  
  // Default to true (online) if no data
  for (const s of systemServicesEnum.enumValues) {
    autoStatus[s] = true
  }

  for (const row of uptimeRows) {
    const dataArray = row.uptimeData as (1 | 0 | null)[]
    if (dataArray && dataArray.length > 0) {
      const hasDowntime = dataArray.some(status => status === 0)
      if (hasDowntime) {
        autoStatus[row.service] = false
      }
    }
  }

  return { overrides, autoStatus }
}

export async function setOverrideStatus(
  service: typeof systemServicesEnum.enumValues[number], 
  status: 'auto' | 'online' | 'offline'
) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support') {
    throw new Error('Unauthorized')
  }

  const { systemStatusOverride } = await import('@/db/schema/system-status')
  await db.insert(systemStatusOverride).values({
    service,
    status
  }).onConflictDoUpdate({
    target: systemStatusOverride.service,
    set: { status, updatedAt: new Date() }
  })

  revalidatePath('/status')
  revalidatePath('/admin/system-status')
}
