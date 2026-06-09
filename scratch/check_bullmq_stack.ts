import { marketplaceSyncQueue } from '../src/workers/marketplace-sync';

async function main() {
  const failed = await marketplaceSyncQueue.getFailed();
  const recentFailed = failed.filter(j => j.timestamp > Date.now() - 3600000);
  console.log('Recent Failed:');
  for (const j of recentFailed) {
    console.log(`\nJob: ${j.name}`);
    console.log(`Reason: ${j.failedReason}`);
    console.log(`Stacktrace: ${j.stacktrace.join('\n')}`);
  }
  process.exit(0);
}

main().catch(console.error);
