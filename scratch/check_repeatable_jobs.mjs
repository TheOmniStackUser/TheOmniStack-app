import IORedis from 'ioredis'
import { Queue } from 'bullmq'

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379')

const marketplaceSyncQueue = new Queue('marketplace-sync', {
  connection: redisConnection
})

async function main() {
  try {
    const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs()
    console.log("Repeatable Jobs:", JSON.stringify(repeatableJobs, null, 2))
    
    const jobs = await marketplaceSyncQueue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'])
    console.log("Total jobs in queue:", jobs.length)
    if (jobs.length > 0) {
      console.log("Last 5 jobs:")
      jobs.slice(-5).forEach(job => {
        console.log(`- Job ID: ${job.id}, Name: ${job.name}, Status: ${job.getState ? 'async getState' : 'N/A'}, Data: ${JSON.stringify(job.data)}, FailedReason: ${job.failedReason}`)
      })
    }
    
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
