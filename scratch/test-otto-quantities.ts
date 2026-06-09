import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'

async function main() {
  const connections = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'))
  if (connections.length === 0) {
    console.log('No otto connection found')
    return
  }

  const c = connections[0]
  const config = c.credentials as any
  
  const adapter = new OttoAdapter(config)
  // @ts-ignore
  const token = await adapter.getAccessToken()

  console.log('Fetching quantities...')
  const baseUrl = config.environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market'
  const res = await fetch(`${baseUrl}/v3/quantities`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  })

  if (!res.ok) {
    console.error(res.status, await res.text())
    return
  }

  const data = await res.json()
  console.log('Quantities:', JSON.stringify(data).slice(0, 500))
}

main().catch(console.error)
