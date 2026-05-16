import { createMarketplaceSyncWorker } from './marketplace-sync'
import { createReturnsReportWorker } from './returns-report'
import { setupScheduledReports } from './scheduler'

console.log('🚀 Starting OmniStack Worker Engine...')

const dbUrl = process.env.DATABASE_URL || 'NOT SET'
console.log(`📡 Database: ${dbUrl.split('@')[1] || 'Local/Fallback'}`)

// Initialize Workers
const marketplaceWorker = createMarketplaceSyncWorker()
const returnsWorker = createReturnsReportWorker()

// Setup CRON jobs
setupScheduledReports().catch(console.error)

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

process.on('SIGINT', async () => {
  console.log('Shutting down workers...')
  await Promise.all([
    marketplaceWorker.close(),
    returnsWorker.close()
  ])
  process.exit(0)
})
