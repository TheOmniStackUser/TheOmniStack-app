'use server'

import { db } from '@/db/client'
import { systemIncidents, systemStatusDaily, systemServicesEnum } from '@/db/schema/system-status'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, or, gte, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/session'

// We map marketplace integration types to system services where applicable
const integrationTypeToServiceMap: Record<string, string> = {
  'amazon': 'amazon',
  'otto': 'otto',
  'mirakl_decathlon': 'decathlon',
  'mirakl_decathlon_eu': 'decathlon',
  'mirakl_mediamarkt': 'mediamarkt',
  'shopify': 'shopify',
  'aboutyou': 'aboutyou',
  'dhl': 'dhl',
  'hermes': 'hermes',
  'limango': 'limango',
  'kaufland': 'kaufland',
  'ebay': 'ebay',
  'woocommerce': 'woocommerce',
  'shopware': 'shopware',
}

export async function getSystemStatusData() {
  const auth = await requireAuth()

  // Find out which integrations this company uses
  const activeIntegrations = await db.query.marketplaceIntegrations.findMany({
    where: eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
    columns: {
      type: true,
      isActive: true,
    }
  })

  const usedServices = new Set<string>()
  
  // Add all services from the enum
  for (const service of systemServicesEnum.enumValues) {
    // Exclude the other app variant
    if (process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' && service === 'theomnistack_app') continue
    if (process.env.NEXT_PUBLIC_APP_VARIANT !== 'craft' && service === 'profifaktura_app') continue
    
    usedServices.add(service)
  }

  // Fetch incidents from the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const rawIncidents = await db.query.systemIncidents.findMany({
    where: gte(systemIncidents.createdAt, thirtyDaysAgo),
    orderBy: [desc(systemIncidents.createdAt)]
  })

  // Filter based on rules:
  // - Incidents within last 30 days (already filtered by SQL query)
  // - Maintenance only visible up to 1 day after it ended (or was planned if no end time)
  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const allIncidents = rawIncidents.filter(incident => {
    if (incident.status === 'maintenance') {
      if (incident.endTime) {
        return incident.endTime >= oneDayAgo
      } else {
        return incident.createdAt >= oneDayAgo
      }
    }
    return true
  })

  // Filter incidents for used services
  const relevantIncidents = allIncidents.filter(incident => usedServices.has(incident.service))

  // Fetch 90 days of uptime data for the used services
  // To keep data transfer minimal, we just pull the last 90 rows per service and combine them.
  // Actually, we can just return a mocked 90 day array for all used services initially since we just created the table and it has no data.
  // As days go by, the table will fill up. 
  // Let's implement real fetching.
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const uptimeRows = await db.query.systemStatusDaily.findMany({
    where: gte(systemStatusDaily.date, ninetyDaysAgo)
  })

  const serviceUptimeMap: Record<string, (1 | 0 | null)[]> = {}
  
  // Initialize with nulls
  for (const service of usedServices) {
    serviceUptimeMap[service] = Array(90).fill(null)
  }

  // Populate actual data
  // We align it by taking the difference in days from today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (const row of uptimeRows) {
    if (usedServices.has(row.service)) {
      const rowDate = new Date(row.date)
      rowDate.setHours(0, 0, 0, 0)
      const diffTime = Math.abs(today.getTime() - rowDate.getTime())
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      const index = 89 - diffDays
      
      if (index >= 0 && index < 90) {
        // Summarize the day's uptime array. If any hour was 0, mark the day as 0, else 1
        // Assuming uptimeData is an array of 1s and 0s
        const dataArray = row.uptimeData as (1 | 0 | null)[]
        if (!dataArray || dataArray.length === 0) continue

        const hasDowntime = dataArray.some(status => status === 0)
        const hasUptime = dataArray.some(status => status === 1)
        
        if (hasDowntime) {
          serviceUptimeMap[row.service][index] = 0
        } else if (hasUptime) {
          serviceUptimeMap[row.service][index] = 1
        }
      }
    }
  }

  // Fetch overrides
  const overridesRows = await db.query.systemStatusOverride.findMany()
  const overrides: Record<string, string> = {}
  for (const o of overridesRows) {
    if (usedServices.has(o.service)) {
      overrides[o.service] = o.status
    }
  }

  return {
    usedServices: Array.from(usedServices),
    incidents: relevantIncidents,
    uptimeData: serviceUptimeMap,
    overrides
  }
}
