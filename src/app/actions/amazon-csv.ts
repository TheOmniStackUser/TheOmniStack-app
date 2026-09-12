'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { products, productMappings } from '@/db/schema/products'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'

export async function importAmazonCsvAction(formData: FormData) {
  const auth = await requireAuth()
  const integrationId = formData.get('integrationId') as string
  const file = formData.get('file') as File

  if (!integrationId || !file) {
    return { error: 'Fehlende Daten für den Import.' }
  }

  // Verify integration
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.id, integrationId),
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!integration) {
    return { error: 'Integration nicht gefunden.' }
  }

  try {
    const text = await file.text()
    // Try splitting by tab first, as Amazon often exports TSV disguised as TXT/CSV
    let separator = '\t'
    if (text.indexOf('\t') === -1 && text.indexOf(';') !== -1) separator = ';'
    if (text.indexOf('\t') === -1 && text.indexOf(';') === -1 && text.indexOf(',') !== -1) separator = ','

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
    if (lines.length < 2) return { error: 'Datei ist leer oder hat kein korrektes Format.' }

    const headers = lines[0].split(separator).map(h => h.toLowerCase().trim().replace(/"/g, ''))
    
    // Find column indexes
    const skuIdx = headers.findIndex(h => h.includes('sku') && !h.includes('fnsku'))
    const asinIdx = headers.findIndex(h => h === 'asin1' || h === 'asin')
    const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('titel') || h.includes('title'))
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('preis'))
    const quantityIdx = headers.findIndex(h => h.includes('quantity') || h.includes('menge') || h.includes('stock'))

    if (skuIdx === -1) {
      return { error: 'Konnte die Spalte "SKU" nicht in der Datei finden.' }
    }

    let importedCount = 0
    let mappedCount = 0

    // Fetch existing mappings and products to avoid duplicates
    const existingMappings = await db.select().from(productMappings).where(and(eq(productMappings.companyId, auth.activeCompanyId), eq(productMappings.integrationId, integration.id)))
    const mappedSkus = new Set(existingMappings.map(m => m.marketplaceSku))

    const existingProducts = await db.select({ id: products.id, sku: products.sku }).from(products).where(eq(products.companyId, auth.activeCompanyId))
    const centralProductMap = new Map(existingProducts.map(p => [p.sku, p]))

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const cols = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''))
      
      const sku = cols[skuIdx]
      const asin = asinIdx !== -1 ? cols[asinIdx] : sku
      const title = titleIdx !== -1 ? cols[titleIdx] : sku
      
      let price = 0
      if (priceIdx !== -1 && cols[priceIdx]) {
        price = parseFloat(cols[priceIdx].replace(',', '.'))
        if (isNaN(price)) price = 0
      }

      let stock = null
      if (quantityIdx !== -1 && cols[quantityIdx]) {
        stock = parseInt(cols[quantityIdx], 10)
        if (isNaN(stock)) stock = null
      }

      if (!sku) continue

      if (!mappedSkus.has(sku)) {
        let centralProductId = ''
        const centralProduct = centralProductMap.get(sku)
        
        if (centralProduct) {
          centralProductId = centralProduct.id
        } else {
          centralProductId = crypto.randomUUID()
          const inserted = await db.insert(products).values({
            companyId: auth.activeCompanyId,
            sku: sku,
            title: title,
            price: price.toString(),
            currentStock: stock !== null ? stock.toString() : '0',
          }).returning({ id: products.id })
          centralProductId = inserted[0].id
          centralProductMap.set(sku, { id: centralProductId, sku })
          importedCount++
        }

        await db.insert(productMappings).values({
          id: crypto.randomUUID(),
          companyId: auth.activeCompanyId,
          integrationId: integration.id,
          productId: centralProductId,
          marketplaceSku: sku,
          marketplaceProductId: asin,
          marketplace: integration.type as any
        })
        mappedSkus.add(sku)
        mappedCount++
      }
    }

    revalidatePath('/products')
    return { success: true, message: `Erfolgreich ${importedCount} neue Produkte importiert und ${mappedCount} Verknüpfungen erstellt.` }
  } catch (error: any) {
    console.error('Error importing Amazon CSV:', error)
    return { error: 'Beim Verarbeiten der Datei ist ein unerwarteter Fehler aufgetreten: ' + error.message }
  }
}
