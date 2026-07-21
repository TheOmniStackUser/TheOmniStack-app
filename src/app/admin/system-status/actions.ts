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
