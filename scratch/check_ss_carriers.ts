import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.isActive, true))
  const ssDe = integrations.find(i => {
    const customName = ((i.metadata as any)?.customName || '').toLowerCase()
    return customName.startsWith('secret sales de') || customName === 'secret sales de'
  })

  if (!ssDe) {
    console.log("No Secret Sales DE integration found.")
    return
  }

  const tokenParams = new URLSearchParams()
  tokenParams.append('grant_type', 'client_credentials')
  tokenParams.append('client_id', ssDe.clientId!)
  tokenParams.append('client_secret', ssDe.clientSecret!)
  tokenParams.append('audience', 'mirakl-connect')

  let token = null
  try {
    const authRes = await fetch('https://auth.mirakl.net/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    })
    if (authRes.ok) {
      const data = await authRes.json()
      token = data.access_token
    }
  } catch(e) {}

  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    headers['Authorization'] = ssDe.clientId!
    headers['X-Mirakl-Api-Key'] = ssDe.clientId!
  }

  const baseUrl = ssDe.environment!.replace(/\/$/, '')
  const url = `${baseUrl}/api/shipping/carriers`
  console.log(`Fetching ${url}`)

  const response = await fetch(url, { headers })
  if (!response.ok) {
    console.log("Error:", await response.text())
    return
  }

  const data = await response.json()
  console.log(JSON.stringify(data, null, 2))
}
run()
