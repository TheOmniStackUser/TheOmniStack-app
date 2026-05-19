import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function generateOttoOrders() {
  console.log('🔄 Suche OTTO Sandbox-Integration in der Datenbank...')
  
  // Find the OTTO integration with sandbox environment
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: and(
      eq(marketplaceIntegrations.type, 'otto'),
      eq(marketplaceIntegrations.environment, 'sandbox')
    )
  })

  if (!integration || !integration.clientId || !integration.clientSecret) {
    console.error('❌ Keine OTTO Sandbox-Integration mit gültigen Credentials gefunden!')
    return
  }

  console.log(`✅ Integration gefunden! Client-ID: ${integration.clientId}`)
  console.log('🔑 Hole OAuth-Zugriffstoken von OTTO Sandbox (/oauth2/token)...')

  // The correct OAuth2 token endpoint for OTTO is /oauth2/token
  const tokenUrl = 'https://sandbox.api.otto.market/oauth2/token'

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: integration.clientId,
      client_secret: integration.clientSecret,
      scope: 'developer', // Otto sandbox oauth2 standard scope
    }).toString(),
  })

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text()
    throw new Error(`Fehler beim Token-Abruf: ${tokenResponse.status} - ${errText}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token
  console.log('✅ Token erfolgreich erhalten!')
  
  try {
    const parts = accessToken.split('.')
    if (parts.length === 3) {
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8')
      console.log('🔑 Decoded JWT Payload:', JSON.stringify(JSON.parse(payload), null, 2))
    }
  } catch (jwtErr) {
    console.error('Failed to decode JWT token:', jwtErr)
  }

  console.log('🚀 Trigger den OTTO Sandbox Bestell-Generator (POST /v4/orders/testorders)...')

  const generatorUrl = 'https://sandbox.api.otto.market/v4/orders/testorders'
  const generatorResponse = await fetch(generatorUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  })

  if (!generatorResponse.ok) {
    const errText = await generatorResponse.text()
    console.error(`❌ Fehler beim Auslösen des Bestell-Generators: ${generatorResponse.status} - ${errText}`)
    return
  }

  console.log('🎉 ERFOLG! Der OTTO Bestell-Generator wurde erfolgreich ausgelöst!')
  console.log('📦 OTTO generiert nun im Hintergrund 8 Test-Szenarien für dich (davon 6 abrufbare Bestellungen).')
  console.log('💡 Du kannst diese Bestellungen nun im Backend deiner App abrufen oder über deinen automatischen Sync einlesen lassen!')
}

generateOttoOrders().catch(err => {
  console.error('💥 Fataler Fehler:', err)
})
