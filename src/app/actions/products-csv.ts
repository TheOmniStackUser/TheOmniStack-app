'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { eq, sql, and } from 'drizzle-orm'
import Papa from 'papaparse'

export async function exportProductsCsv() {
  const auth = await requireAuth()
  
  const productList = await db
    .select()
    .from(products)
    .where(eq(products.companyId, auth.activeCompanyId))
    .orderBy(products.createdAt)

  const allMappings = await db
    .select()
    .from(productMappings)
    .where(eq(productMappings.companyId, auth.activeCompanyId))

  // Find all distinct marketplaces to create columns
  const marketplaces = Array.from(new Set(allMappings.map(m => m.marketplace)))

  // Map to CSV format
  const csvData = productList.map(p => {
    const pMappings = allMappings.filter(m => m.productId === p.id)
    const baseRow: Record<string, string> = {
      SKU: p.sku,
      Titel: p.title,
      Beschreibung: p.description || '',
      EAN: p.ean || '',
      Bestand: p.currentStock?.toString() || '0',
      Preis: p.price?.toString() || '0',
      UVP: p.msrp?.toString() || '',
      'Reduzierter Preis': p.reducedPrice?.toString() || '',
      Einkaufspreis: p.purchasePrice?.toString() || '',
      Gewicht: p.weight?.toString() || '',
      Lagerort: p.storageLocation || ''
    }

    // Add mapping columns dynamically
    marketplaces.forEach(mp => {
      const mpMappings = pMappings.filter(m => m.marketplace === mp)
      if (mpMappings.length > 0) {
        // Format as SKU[EAN] if EAN exists, else just SKU
        baseRow[`Mapping: ${mp}`] = mpMappings.map(m => m.ean ? `${m.marketplaceSku}[${m.ean}]` : m.marketplaceSku).join(', ')
      } else {
        baseRow[`Mapping: ${mp}`] = ''
      }
    })

    return baseRow
  })

  const csvString = Papa.unparse(csvData, { quotes: true, delimiter: ';' })
  return csvString
}

export async function importProductsCsvAction(csvString: string) {
  const auth = await requireAuth()
  
  // Wir unterstützen ; und , als Trennzeichen, papaparse erkennt das meist automatisch
  const result = Papa.parse(csvString, { header: true, skipEmptyLines: true })
  
  if (result.errors.length > 0) {
    // throw first error
    throw new Error('CSV Formatierungsfehler: ' + result.errors[0].message)
  }
  
  const rows = result.data as Record<string, string>[]
  
  let imported = 0
  
  for (const row of rows) {
    const sku = row['SKU']?.trim()
    const title = (row['Titel'] || row['Title'])?.trim()
    
    if (!sku || !title) {
      continue // Skip rows missing mandatory fields
    }
    
    const description = row['Beschreibung']?.trim() || null
    const ean = row['EAN']?.trim() || null
    
    // Hilfsfunktion für Zahlen
    const parseNumber = (val?: string) => {
      if (!val) return null
      const parsed = val.replace(',', '.')
      return isNaN(Number(parsed)) ? null : parsed
    }
    
    const currentStock = parseNumber(row['Bestand']) || '0'
    const price = parseNumber(row['Preis']) || '0'
    const msrp = parseNumber(row['UVP'])
    const reducedPrice = parseNumber(row['Reduzierter Preis'])
    const purchasePrice = parseNumber(row['Einkaufspreis'])
    const weight = parseNumber(row['Gewicht'])
    const storageLocation = row['Lagerort']?.trim() || null
    
    const [insertedProduct] = await db.insert(products).values({
      companyId: auth.activeCompanyId,
      sku,
      title,
      description,
      ean,
      currentStock,
      price,
      msrp,
      reducedPrice,
      purchasePrice,
      weight,
      storageLocation,
      updatedAt: sql`now()`
    }).onConflictDoUpdate({
      target: [products.companyId, products.sku],
      set: {
        title,
        description,
        ean,
        currentStock,
        price,
        msrp,
        reducedPrice,
        purchasePrice,
        weight,
        storageLocation,
        updatedAt: sql`now()`
      }
    }).returning({ id: products.id })
    
    // Process Mappings
    const mappingKeys = Object.keys(row).filter(key => key.startsWith('Mapping: '))
    for (const mappingKey of mappingKeys) {
      const marketplace = mappingKey.replace('Mapping: ', '').trim()
      const mappingValue = row[mappingKey]?.trim()
      
      // Delete existing mappings for this product and marketplace
      await db.delete(productMappings).where(
        and(
          eq(productMappings.companyId, auth.activeCompanyId),
          eq(productMappings.productId, insertedProduct.id),
          eq(productMappings.marketplace, marketplace as any)
        )
      )

      if (mappingValue) {
        const mappingEntries = mappingValue.split(',').map(s => s.trim()).filter(Boolean)
        
        for (const entry of mappingEntries) {
          // Parse SKU and optional EAN e.g. "SKU123[425123456]"
          const match = entry.match(/^([^\[\]]+)(?:\[([^\]]+)\])?$/)
          if (match) {
            const mpSku = match[1].trim()
            const mpEan = match[2]?.trim() || ean || null
            
            await db.insert(productMappings).values({
              companyId: auth.activeCompanyId,
              productId: insertedProduct.id,
              marketplace: marketplace as any,
              marketplaceSku: mpSku,
              ean: mpEan,
              syncStock: true,
              syncPrice: false
            }).onConflictDoNothing()
          }
        }
      }
    }
    
    imported++
  }
  
  return { success: true, count: imported }
}
