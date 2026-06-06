'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products } from '@/db/schema/products'
import { eq, sql } from 'drizzle-orm'
import Papa from 'papaparse'

export async function exportProductsCsv() {
  const auth = await requireAuth()
  
  const productList = await db
    .select()
    .from(products)
    .where(eq(products.companyId, auth.activeCompanyId))
    .orderBy(products.createdAt)

  // Map to CSV format
  const csvData = productList.map(p => ({
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
  }))

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
    
    await db.insert(products).values({
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
    })
    
    imported++
  }
  
  return { success: true, count: imported }
}
