import { marketplaceSyncQueue } from '../src/workers/marketplace-sync'

const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
const userId = '00000000-0000-0000-0000-000000000000'

async function trigger() {
  const marketplaces = ['otto', 'aboutyou', 'mirakl_decathlon_eu']
  
  for (const mp of marketplaces) {
    console.log(`Enqueuing sync for ${mp}...`)
    await marketplaceSyncQueue.add(
      `manual-sync-${mp}-${Date.now()}`,
      {
        companyId,
        marketplace: mp as any,
        triggeredByUserId: userId,
      }
    )
  }
  console.log('Done!')
  process.exit(0)
}

trigger().catch(console.error)
