import IORedis from 'ioredis'
import { Queue } from 'bullmq'

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379')
const queue = new Queue('marketplace-sync', { connection: redisConnection })

async function main() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb'
  try {
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'])
    console.log(`Found ${jobs.length} total jobs. Filtering for company: ${companyId}`)
    
    const companyJobs = jobs.filter(j => j.data?.companyId === companyId)
    console.log(`Found ${companyJobs.length} jobs for this company.`)
    
    companyJobs.forEach(job => {
      console.log({
        id: job.id,
        name: job.name,
        timestamp: new Date(job.timestamp).toISOString(),
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failedReason: job.failedReason,
        data: job.data,
      })
    })
    
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
