import { OttoAdapter } from '../src/adapters/marketplace/otto'

async function test() {
  console.log('--- Testing OTTO API Scopes ---')
  
  const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
  console.log(`Initializing OttoAdapter for company ${companyId}...`)
  
  const adapter = new OttoAdapter(companyId)
  await adapter.initialize()
  
  console.log('1. Fetching Installation Access Token...')
  let token = ''
  try {
    token = await adapter.getAccessToken()
    if (!token) {
      console.error('Failed to get token! Is the integration fully authorized?')
      process.exit(1)
    }
    console.log('SUCCESS: Got Installation Token.')
  } catch (e: any) {
    console.error('Exception during token fetch:', e.message)
    process.exit(1)
  }

  const baseUrl = 'https://sandbox.api.otto.market'
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }

  const endpoints = [
    { name: 'Products', url: '/v5/products?limit=1' },
    { name: 'Availability (Quantities)', url: '/v1/availability/quantities?limit=1' },
    { name: 'Orders', url: '/v4/orders?limit=1' },
    { name: 'Shipments', url: '/v1/shipments?limit=1' },
    { name: 'Returns', url: '/v1/returns?limit=1' },
    { name: 'Receipts', url: '/v2/receipts?limit=1' }
  ]

  for (const ep of endpoints) {
    console.log(`\n--- Testing Scope: ${ep.name} ---`)
    console.log(`GET ${ep.url}`)
    try {
      const res = await fetch(`${baseUrl}${ep.url}`, { headers })
      console.log(`Status: ${res.status} ${res.statusText}`)
      if (!res.ok) {
        console.log(`Error Response:`, await res.text())
      } else {
        const text = await res.text()
        const preview = text.slice(0, 150).replace(/\n/g, '')
        console.log(`Success! Data preview:`, preview + (text.length > 150 ? '...' : ''))
      }
    } catch (e: any) {
      console.log(`Failed to fetch ${ep.name}:`, e.message)
    }
  }
  
  console.log('\n--- Done ---')
  process.exit(0)
}

test().catch(console.error)
