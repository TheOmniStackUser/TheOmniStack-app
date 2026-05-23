import { syncShippedOrdersInvoices } from '../src/workers/marketplace-sync'

async function run() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb'
  console.log('Starting shipped recovery sync script...')
  try {
    await syncShippedOrdersInvoices(companyId, 'otto')
    console.log('Recovery sync script completed successfully!')
  } catch (err) {
    console.error('Error running recovery sync:', err)
  }
  process.exit(0)
}

run()
