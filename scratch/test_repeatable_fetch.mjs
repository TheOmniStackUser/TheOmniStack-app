import IORedis from 'ioredis'
import { Queue } from 'bullmq'

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379')
const queue = new Queue('marketplace-sync', { connection: redisConnection })

async function test() {
  const repeatableJobs = await queue.getRepeatableJobs()
  console.log(`Found ${repeatableJobs.length} repeatable jobs.`)

  for (const job of repeatableJobs) {
    const jobKey = `bull:marketplace-sync:repeat:${job.key}:${job.next}`
    const jobData = await redisConnection.hgetall(jobKey)
    console.log(`\nJob Key: ${job.key}`)
    console.log(`Redis Key: ${jobKey}`)
    console.log(`Exists: ${Object.keys(jobData).length > 0}`)
    
    if (Object.keys(jobData).length > 0) {
      console.log(`Name: ${jobData.name}`)
      console.log(`Data: ${jobData.data}`)
      try {
        const opts = JSON.parse(jobData.opts || '{}')
        console.log(`Repeat Opts:`, opts.repeat)
      } catch (e) {
        console.error('Failed to parse opts:', e)
      }
    }
  }
  process.exit(0)
}

test().catch(console.error)
