import { createMarketplaceSyncWorker } from './marketplace-sync'

console.log('🚀 Starting Marketplace Sync Worker...')
const worker = createMarketplaceSyncWorker()

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} for ${job.data.marketplace} completed successfully.`)
})

worker.on('failed', (job, err) => {
  console.log(`❌ Job ${job?.id} failed:`, err.message)
})

process.on('SIGINT', async () => {
  console.log('Shutting down worker...')
  await worker.close()
  process.exit(0)
})
