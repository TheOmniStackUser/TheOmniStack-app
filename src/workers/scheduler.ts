import { returnsReportQueue } from './returns-report'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { marketplaceSyncQueue } from './marketplace-sync'
import { dunningQueue } from './dunning'
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
 * Sets up hourly repeatable invoice sync jobs for all companies where enabled.
 */
export async function setupHourlyInvoiceSyncs() {
  console.log('⏰ Setting up scheduled hourly invoice syncs...')

  // Clean up any existing repeatable hourly invoice sync jobs from the queue
  try {
    const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      if (job.key?.includes('hourly-invoice-sync')) {
        await marketplaceSyncQueue.removeRepeatableByKey(job.key)
        console.log(`   - Cleared old repeatable invoice sync job: ${job.key}`)
      }
    }
  } catch (err) {
    console.error('[Scheduler] Failed to clear old repeatable invoice sync jobs:', err)
  }

  await marketplaceSyncQueue.add(
    'hourly-invoice-sync',
    { companyId: 'all' }, // special marker for all companies
    {
      jobId: 'hourly-invoice-sync',
      repeat: {
        pattern: '0 * * * *', // every hour
        tz: 'Europe/Berlin',
      },
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  console.log(`   - Scheduled hourly invoice sync at minute 0 (Europe/Berlin)`)
}

/**
 * Sets up daily repeatable marketplace sync jobs for all companies where enabled.
 */
export async function setupScheduledSyncs() {
  console.log('⏰ Setting up scheduled daily marketplace syncs...')
  
  // Clean up any existing repeatable marketplace sync jobs from the queue
  try {
    const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs()
    const client = await marketplaceSyncQueue.client
    for (const job of repeatableJobs) {
      const redisKey = `${marketplaceSyncQueue.toKey('repeat')}:${job.key}:${job.next}`
      const jobData = await client.hgetall(redisKey)
      let jobId: string | null = null
      if (jobData && jobData.opts) {
        try {
          const opts = JSON.parse(jobData.opts)
          jobId = opts.repeat?.jobId || opts.jobId || null
        } catch (e) {}
      }

      if (jobId?.startsWith('daily-sync-')) {
        await marketplaceSyncQueue.removeRepeatableByKey(job.key)
        console.log(`   - Cleared old repeatable sync job: ${jobId}`)
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
          tz: 'Europe/Berlin',
        },
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    )
    console.log(`   - Scheduled daily sync at ${time} (Europe/Berlin) for company: ${company.name}`)
  }
}

/**
 * Sets up the daily dunning (Mahnwesen) check for all companies.
 * Runs every morning at 08:00 Europe/Berlin.
 */
export async function setupDunningSchedule() {
  console.log('⏰ Setting up daily dunning check...')

  // Clean up old repeatable dunning jobs first
  try {
    const repeatableJobs = await dunningQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      if (job.key?.includes('dunning-daily')) {
        await dunningQueue.removeRepeatableByKey(job.key)
        console.log(`   - Cleared old repeatable dunning job: ${job.key}`)
      }
    }
  } catch (err) {
    console.error('[Scheduler] Failed to clear old dunning jobs:', err)
  }

  await dunningQueue.add(
    'daily-dunning-check',
    {}, // no companyId = runs for all companies
    {
      jobId: 'dunning-daily',
      repeat: {
        pattern: '0 8 * * *', // 08:00 every day
        tz: 'Europe/Berlin',
      },
      removeOnComplete: true,
    }
  )
  console.log('   - Scheduled daily dunning check at 08:00 (Europe/Berlin)')
}
