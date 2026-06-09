import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

const OTTO_APP_CLIENT_ID = process.env.OTTO_APP_CLIENT_ID || '9c74d78a-cc67-412f-8d25-7652b43ac41b'
const OTTO_APP_CLIENT_SECRET = process.env.OTTO_APP_CLIENT_SECRET || 'f9600fd0-6cc2-4b77-a692-b472d65d331c'

async function main() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(and(eq(marketplaceIntegrations.type, 'otto'), eq(marketplaceIntegrations.isActive, true)))
    .limit(1)

  if (!integration) {
    console.log('No active Otto integration found')
    process.exit(1)
  }

  console.log('Integration found:', integration.type, integration.environment)
  console.log('clientId:', integration.clientId)
  console.log('metadata:', JSON.stringify(integration.metadata))

  const isPrivate = (integration.metadata as any)?.connectionType === 'private'
  const baseUrl = integration.environment === 'sandbox'
    ? 'https://sandbox.api.otto.market'
    : 'https://api.otto.market'
  const tokenUrl = integration.environment === 'sandbox'
    ? 'https://sandbox.api.otto.market/oauth2/token'
    : 'https://api.otto.market/oauth2/token'

  const tokenClientId = isPrivate ? integration.clientId! : OTTO_APP_CLIENT_ID
  const tokenClientSecret = isPrivate ? integration.clientSecret! : OTTO_APP_CLIENT_SECRET
  const basicAuth = Buffer.from(`${tokenClientId}:${tokenClientSecret}`).toString('base64')

  console.log('\n--- Step 1: Getting access token ---')
  console.log(`tokenUrl: ${tokenUrl}`)
  console.log(`isPrivate: ${isPrivate}`)
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${basicAuth}` },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: isPrivate ? 'orders products shipments returns receipts availability price-reduction' : 'developer',
    }).toString(),
  })
  console.log('Token response status:', tokenRes.status)
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    console.error('Token error:', JSON.stringify(tokenData))
    process.exit(1)
  }
  let accessToken = tokenData.access_token
  console.log('Token obtained:', accessToken ? 'YES' : 'NO')

  // Exchange for installation token if needed
  if (!isPrivate && (integration.metadata as any)?.installationId && (integration.metadata as any)?.appId) {
    const appId = (integration.metadata as any).appId
    const installationId = (integration.metadata as any).installationId
    console.log(`\n--- Step 2: Exchanging for installation token (appId: ${appId}, installId: ${installationId}) ---`)
    const installUrl = `${baseUrl}/v1/apps/${appId}/installations/${installationId}/accessToken`
    const installRes = await fetch(installUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'orders products shipments returns receipts availability price-reduction'
      }).toString()
    })
    console.log('Install token status:', installRes.status)
    const installText = await installRes.text()
    console.log('Install token response:', installText.slice(0, 200))
    if (installRes.ok) {
      accessToken = JSON.parse(installText).access_token
    } else {
      console.warn('Could not get installation token, using developer token')
    }
  }

  // Test products endpoint
  console.log('\n--- Step 3: Fetching v5/products ---')
  const productsRes = await fetch(`${baseUrl}/v5/products?limit=5`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  })
  console.log('Products status:', productsRes.status)
  const productsText = await productsRes.text()
  console.log('Products response (first 1000 chars):', productsText.slice(0, 1000))

  // Test availability endpoint
  console.log('\n--- Step 4: Fetching v1/availability/quantities ---')
  const qRes = await fetch(`${baseUrl}/v1/availability/quantities?limit=5`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  })
  console.log('Quantities status:', qRes.status)
  const qText = await qRes.text()
  console.log('Quantities response (first 1000 chars):', qText.slice(0, 1000))

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
