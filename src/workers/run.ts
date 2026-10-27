import { createMarketplaceSyncWorker } from './marketplace-sync'
import { createReturnsReportWorker } from './returns-report'
import { createDunningWorker } from './dunning'
import { createProductSyncWorker } from './product-sync'
import { systemStatusWorker } from './system-status-check'
import { setupScheduledReports, setupScheduledSyncs, setupDunningSchedule, setupHourlyInvoiceSyncs, setupSystemStatusCheck } from './scheduler'

console.log('🚀 Starting OmniStack Worker Engine...')

const dbUrl = process.env.DATABASE_URL || 'NOT SET'
console.log(`📡 Database: ${dbUrl.split('@')[1] || 'Local/Fallback'}`)

// Initialize Workers
const marketplaceWorker = createMarketplaceSyncWorker()
const returnsWorker = createReturnsReportWorker()
const dunningWorker = createDunningWorker()
const productWorker = createProductSyncWorker()

// Setup CRON jobs
setupScheduledReports().catch(console.error)
setupScheduledSyncs().catch(console.error)
setupHourlyInvoiceSyncs().catch(console.error)
setupDunningSchedule().catch(console.error)
setupSystemStatusCheck().catch(console.error)

marketplaceWorker.on('completed', (job) => {
  console.log(`✅ [Marketplace] Job ${job.id} completed.`)
})

marketplaceWorker.on('failed', (job, err) => {
  console.log(`❌ [Marketplace] Job ${job?.id} failed:`, err.message)
})

returnsWorker.on('completed', (job) => {
  console.log(`✅ [Returns] Report for Job ${job.id} generated successfully.`)
})

returnsWorker.on('failed', (job, err) => {
  console.log(`❌ [Returns] Job ${job?.id} failed:`, err.message)
})

dunningWorker.on('completed', (job, result) => {
  console.log(`✅ [Dunning] Job ${job.id} completed. Sent: ${result?.sent ?? 0}, Skipped: ${result?.skipped ?? 0}, Failed: ${result?.failed ?? 0}`)
})

dunningWorker.on('failed', (job, err) => {
  console.log(`❌ [Dunning] Job ${job?.id} failed:`, err.message)
})

productWorker.on('completed', (job) => {
  console.log(`✅ [ProductSync] Job ${job.id} completed.`)
})

productWorker.on('failed', (job, err) => {
  console.log(`❌ [ProductSync] Job ${job?.id} failed:`, err.message)
})

process.on('uncaughtException', (err: any) => {
  if (err?.message && (err.message.includes("Cannot read properties of null (reading 'write')") || err.code === 'CONNECTION_CLOSED')) {
    console.warn('⚠️ [Worker Engine] Caught transient postgres driver socket disconnection safely:', err.message)
    return
  }
  console.error('💥 [Worker Engine] Fatal Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason: any, promise) => {
  if (reason?.message && (reason.message.includes("Cannot read properties of null (reading 'write')") || reason.code === 'CONNECTION_CLOSED')) {
    console.warn('⚠️ [Worker Engine] Caught unhandled database connection rejection safely:', reason.message)
    return
  }
  console.error('⚠️ [Worker Engine] Unhandled Rejection at:', promise, 'reason:', reason)
})

const shutdown = async () => {
  console.log('Shutting down workers...')
  await Promise.all([
    marketplaceWorker.close(),
    returnsWorker.close(),
    dunningWorker.close(),
    productWorker.close(),
    systemStatusWorker.close(),
  ])
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
