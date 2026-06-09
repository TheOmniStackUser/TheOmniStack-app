import { marketplaceSyncQueue } from '../src/workers/marketplace-sync';

async function main() {
  const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs();
  console.log('Repeatable Jobs in marketplaceSyncQueue:');
  console.log(JSON.stringify(repeatableJobs, null, 2));

  // Also check if any jobs are currently delayed/waiting
  const delayed = await marketplaceSyncQueue.getDelayed();
  console.log(`\nDelayed jobs: ${delayed.length}`);
  if (delayed.length > 0) {
    console.log(JSON.stringify(delayed.map(j => ({ name: j.name, data: j.data, delay: j.delay, timestamp: j.timestamp })), null, 2));
  }

  process.exit(0);
}

main().catch(console.error);
