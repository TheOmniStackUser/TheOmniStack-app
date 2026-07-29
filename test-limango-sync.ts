import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { MiraklAdapter } from './src/adapters/marketplace/mirakl'

async function run() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.type, 'mirakl_custom')
  })
  
  if (!integration) {
    console.log('No mirakl custom integration found')
    return
  }
  
  const customName = (integration.metadata as any)?.customName || 'mirakl_custom'
  if (customName.toLowerCase() !== 'limango') {
    console.log('Not limango:', customName)
  }

  const adapter = new MiraklAdapter({
    instance: customName.toLowerCase(),
    baseUrl: integration.environment!,
    clientId: integration.clientId,
    clientSecret: integration.clientSecret || '',
    apiKey: integration.apiKey || undefined,
    shopId: (integration.metadata as any)?.shopId || undefined
  })
  
  console.log('Testing updateListings...')
  try {
    const token = await (adapter as any).getAccessToken()
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else {
      const apiKey = integration.clientSecret === '' || !integration.clientSecret 
        ? integration.clientId 
        : integration.apiKey
      
      if (apiKey) {
        headers['Authorization'] = apiKey
        headers['X-Mirakl-Api-Key'] = apiKey
      }
    }
    
    // First let's fetch products to get a valid SKU
    const offersUrl = `${integration.environment}/api/offers?max=1`
    console.log('Fetching 1 offer:', offersUrl)
    const offersRes = await fetch(offersUrl, { headers })
    const offersData = await offersRes.json()
    console.log('Offers data:', JSON.stringify(offersData, null, 2))
    
    const sku = offersData.offers[0]?.shop_sku
    const price = offersData.offers[0]?.price
    
    if (!sku) {
      console.log('No SKU found to update')
      process.exit(0)
    }

    console.log(`Updating SKU ${sku} with price ${price} and stock 99...`)
    
    const url = `${integration.environment}/api/offers`
    const payload = {
      offers: [
        {
          shop_sku: sku,
          update_delete: 'update',
          quantity: 99,
          price: price
        }
      ]
    }
    
    console.log('Payload:', JSON.stringify(payload))
    const updateRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    
    console.log('Update status:', updateRes.status)
    const updateText = await updateRes.text()
    console.log('Update response text:', updateText)

  } catch (e: any) {
    console.error('Error:', e.message)
  }
  
  process.exit(0)
}

run()
