import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function testAuthVariations() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'),
        eq(marketplaceIntegrations.type, 'otto')
      )
    )
    .limit(1)

  const clientId = integration.clientId!
  const clientSecret = integration.clientSecret!
  const tokenUrl = integration.environment === 'sandbox' 
    ? 'https://sandbox.api.otto.market/v1/token' 
    : 'https://api.otto.market/v1/token'

  console.log('Testing against URL:', tokenUrl)

  const variations = [
    {
      name: '1. Basic Auth only',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString()
    },
    {
      name: '2. Basic Auth + Scope',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'orders receipts shipments' }).toString()
    },
    {
      name: '3. Body params only',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString()
    },
    {
      name: '4. JSON body',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
    }
  ]

  for (const v of variations) {
    console.log(`\n--- Testing ${v.name} ---`)
    try {
      const response = await fetch(tokenUrl, { method: 'POST', headers: v.headers, body: v.body })
      const text = await response.text()
      console.log(`Status: ${response.status}`)
      console.log(`Response: ${text.substring(0, 100)}...`)
      if (response.ok) {
        console.log('✅ THIS VARIATION WORKED!')
      }
    } catch (e: any) {
      console.error('Fetch error:', e.message)
    }
  }

  process.exit(0)
}

testAuthVariations().catch(console.error)
