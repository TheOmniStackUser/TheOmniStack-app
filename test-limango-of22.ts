import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { MiraklAdapter } from './src/adapters/marketplace/mirakl'

async function run() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.type, 'mirakl_custom')
  })
  
  if (!integration) return

  const customName = (integration.metadata as any)?.customName || 'mirakl_custom'
  const adapter = new MiraklAdapter({
    instance: customName.toLowerCase(),
    baseUrl: integration.environment!,
    clientId: integration.clientId,
    clientSecret: integration.clientSecret || '',
    apiKey: integration.apiKey || undefined,
    shopId: (integration.metadata as any)?.shopId || undefined
  })
  
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
    
    // Attempt OF22 (if it exists) or OF24
    const url = `${integration.environment}/api/offers` 
    // wait, actually OF01 is POST /api/offers, OF24 is PATCH /api/offers ? Or maybe OF22 is POST /api/offers/stock?
    // Let's test POST /api/offers/stock (if it exists, we'd get a 404 or something else)
    
    console.log('Testing /api/offers/stock...')
    const payload = {
      offers: [
        {
          shop_sku: 'K902-HATxGrau',
          quantity: 11
        }
      ]
    }
    
    const res = await fetch(`${integration.environment}/api/offers/stock`, { method: 'POST', headers, body: JSON.stringify(payload) })
    console.log('Stock API Status:', res.status)
    console.log('Stock API Body:', await res.text())

  } catch (e: any) {
    console.error('Error:', e.message)
  }
  
  process.exit(0)
}

run()
