import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq } from 'drizzle-orm'

async function run() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.type, 'mirakl_custom')
  })
  
  if (!integration) return

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': integration.clientSecret === '' || !integration.clientSecret 
        ? integration.clientId 
        : (integration.apiKey || '')
  }
  if (headers.Authorization) {
    headers['X-Mirakl-Api-Key'] = headers.Authorization
  }

  try {
    const importId = 243550
    const resErr = await fetch(`${integration.environment}/api/offers/imports/${importId}/error_report`, { headers })
    const errText = await resErr.text()
    
    const lines = errText.split('\n')
    const header = lines[0].split(';')
    const errorMsgIdx = header.findIndex(h => h.includes('error-message'))
    
    if (lines.length > 1 && errorMsgIdx !== -1) {
      const row = lines[1].split(';')
      console.log('Error:', row[errorMsgIdx])
    } else {
      console.log('Error log:', errText)
    }

  } catch (e: any) {
    console.error('Error:', e.message)
  }
  
  process.exit(0)
}

run()
