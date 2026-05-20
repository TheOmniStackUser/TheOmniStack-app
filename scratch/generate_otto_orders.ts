import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function generateOttoOrders() {
  console.log('🔄 Suche OTTO Sandbox-Integration in der Datenbank...')
  
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
  console.log('🔑 Hole Installation Access Token über den OttoAdapter...')

  const adapter = new OttoAdapter({
    clientId: integration.clientId,
    clientSecret: integration.clientSecret,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  // getAccessToken is a private method but we can call it if we cast or expose it, or just replicate the flow here
  const accessToken = await (adapter as any).getAccessToken()
  console.log('✅ Token erfolgreich erhalten!')

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
}

generateOttoOrders().catch(err => {
  console.error('💥 Fataler Fehler:', err)
})
