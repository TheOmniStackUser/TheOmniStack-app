import { returnsReportQueue } from './returns-report'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { marketplaceSyncQueue } from './marketplace-sync'
import { eq } from 'drizzle-orm'

/**
 * Sets up repeatable jobs (CRON) for all active companies.
 * This should be called once when the app starts or via a management CLI.
 */
export async function setupScheduledReports() {
  console.log('⏰ Setting up scheduled returns reports...')
  
  const allCompanies = await db.select({ id: companies.id, name: companies.name }).from(companies)
  
  for (const company of allCompanies) {
    const jobId = `daily-returns-${company.id}`
    
    // Schedule for 18:00 every day
    await returnsReportQueue.add(
      'daily-returns-report',
      { companyId: company.id },
      {
        jobId,
        repeat: {
          pattern: '0 18 * * *', // 18:00
        },
        removeOnComplete: true,
      }
    )
    console.log(`   - Scheduled 18:00 report for ${company.name}`)
  }
}

/**
 * Sets up daily repeatable marketplace sync jobs for all companies where enabled.
 */
export async function setupScheduledSyncs() {
  console.log('⏰ Setting up scheduled daily marketplace syncs...')
  
  // Clean up any existing repeatable marketplace sync jobs from the queue
  try {
    const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      if (job.id?.startsWith('daily-sync-')) {
        await marketplaceSyncQueue.removeRepeatableByKey(job.key)
        console.log(`   - Cleared old repeatable sync job: ${job.id}`)
      }
    }
  } catch (err) {
    console.error('[Scheduler] Failed to clear old repeatable sync jobs:', err)
  }

  // Fetch all companies where daily sync is enabled
  const activeSyncCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      fetchOrdersDaily: companies.fetchOrdersDaily,
      fetchOrdersTime: companies.fetchOrdersTime,
      fetchOrdersMarketplaces: companies.fetchOrdersMarketplaces,
    })
    .from(companies)
    .where(eq(companies.fetchOrdersDaily, true))

  for (const company of activeSyncCompanies) {
    if (!company.fetchOrdersMarketplaces || company.fetchOrdersMarketplaces.length === 0) {
      continue
    }

    const time = company.fetchOrdersTime || '03:00'
    const [hourStr, minuteStr] = time.split(':')
    const hour = parseInt(hourStr || '0', 10)
    const minute = parseInt(minuteStr || '0', 10)
    const cronPattern = `${minute} ${hour} * * *`

    const jobId = `daily-sync-${company.id}`

    await marketplaceSyncQueue.add(
      'daily-marketplace-sync',
      { companyId: company.id },
      {
        jobId,
        repeat: {
          pattern: cronPattern,
        },
        removeOnComplete: true,
      }
    )
    console.log(`   - Scheduled daily sync at ${time} for company: ${company.name}`)
  }
}

