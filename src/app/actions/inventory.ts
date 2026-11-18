'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray } from 'drizzle-orm'
import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'
import { generateExcelBuffer, parseExcelBuffer, decodeExcelString, ExcelColumnDef } from '@/lib/excel'

function formatMarketplaceLabel(mp: string): string {
  const map: Record<string, string> = {
    otto: 'Otto',
    aboutyou: 'About You',
    amazon: 'Amazon',
    shopify: 'Shopify',
    ebay: 'eBay',
    etsy: 'Etsy',
    kaufland: 'Kaufland',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    mirakl_custom: 'Mirakl Custom',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
  }
  return map[mp.toLowerCase()] || mp
}

/**
 * Parses a price string like "12,50", "12.50", "1.234,56 €", "1,234.56" into a number or null.
 */
function parseFlexibleNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw

  let str = String(raw)
    .replace(/[€$£\s]/g, '')
    .replace(/EUR/gi, '')
    .trim()

  if (!str || str === '-') return null

  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // German format: 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // English format: 1,234.56 -> 1234.56
      str = str.replace(/,/g, '')
    }
  } else if (lastComma > -1) {
    // Only comma present: 12,50 -> 12.50
    str = str.replace(',', '.')
  }

  const num = Number(str)
  return isNaN(num) ? null : num
}

function formatGermanNumber(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return ''
  return num.toFixed(decimals).replace('.', ',')
}

async function fetchConsolidatedProductsWithMappings(companyId: string) {
  const [productList, allMappings] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.companyId, companyId))
      .orderBy(products.sku, products.createdAt),
    db
      .select({
        productId: productMappings.productId,
        marketplaceSku: productMappings.marketplaceSku,
        ean: productMappings.ean,
        marketplace: productMappings.marketplace,
        integrationType: marketplaceIntegrations.type,
        integrationMetadata: marketplaceIntegrations.metadata,
      })
      .from(productMappings)
      .innerJoin(marketplaceIntegrations, eq(productMappings.integrationId, marketplaceIntegrations.id))
      .where(
        and(
          eq(productMappings.companyId, companyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      ),
  ])

  const mappingsByProduct = new Map<string, typeof allMappings>()
  for (const m of allMappings) {
    const list = mappingsByProduct.get(m.productId) || []
    list.push(m)
    mappingsByProduct.set(m.productId, list)
  }

  return productList.map(p => {
    const pMappings = mappingsByProduct.get(p.id) || []
    const uniqueMappedSkus = Array.from(new Set(pMappings.map(m => m.marketplaceSku).filter(Boolean)))
    const marketplaces = Array.from(
      new Set(
        pMappings.map(m => {
          if (m.integrationType === 'mirakl_custom' && (m.integrationMetadata as any)?.customName) {
            return String((m.integrationMetadata as any).customName)
          }
          return formatMarketplaceLabel(m.marketplace)
        })
      )
    )

    return {
      ...p,
      mappedSkusList: uniqueMappedSkus,
      mappedSkusJoined: uniqueMappedSkus.join(', '),
      marketplacesList: marketplaces,
      marketplacesJoined: marketplaces.join(', '),
    }
  })
}

// ─── 1. Download Purchase Price Template (Excel & CSV) ────────────────────────
export async function downloadPurchasePriceTemplateAction(options: {
  format: 'csv' | 'xlsx'
  filter?: 'all' | 'missing_ek' | 'in_stock'
  productIds?: string[]
}) {
  const auth = await requireAuth()
  let items = await fetchConsolidatedProductsWithMappings(auth.activeCompanyId)

  if (options.productIds && options.productIds.length > 0) {
    const idSet = new Set(options.productIds)
    items = items.filter(p => idSet.has(p.id))
  } else if (options.filter === 'missing_ek') {
    items = items.filter(p => p.purchasePrice === null || p.purchasePrice === undefined || Number(p.purchasePrice) <= 0)
  } else if (options.filter === 'in_stock') {
    items = items.filter(p => Number(p.currentStock || 0) > 0)
  }

  const dateStr = new Date().toISOString().split('T')[0]

  if (options.format === 'xlsx') {
    const columns: ExcelColumnDef[] = [
      { header: 'SKU', key: 'sku', width: 22, type: 'string' },
      { header: 'Zusammengefasste SKUs', key: 'mappedSkus', width: 28, type: 'string' },
      { header: 'Titel', key: 'title', width: 38, type: 'string' },
      { header: 'Farbe', key: 'color', width: 15, type: 'string' },
      { header: 'Größe', key: 'size', width: 12, type: 'string' },
      { header: 'EAN', key: 'ean', width: 18, type: 'string' },
      { header: 'Lagerort', key: 'storageLocation', width: 16, type: 'string' },
      { header: 'Bestand', key: 'stock', width: 12, type: 'integer' },
      { header: 'Verkaufspreis (Brutto)', key: 'price', width: 20, type: 'currency' },
      { header: 'Einkaufspreis', key: 'purchasePrice', width: 18, type: 'currency' },
    ]

    const rows = items.map(p => ({
      sku: p.sku,
      mappedSkus: p.mappedSkusJoined || p.sku,
      title: p.title,
      color: p.color || '',
      size: p.size || '',
      ean: p.ean || '',
      storageLocation: p.storageLocation || '',
      stock: Number(p.currentStock || 0),
      price: Number(p.price || 0),
      purchasePrice: p.purchasePrice !== null && p.purchasePrice !== undefined ? Number(p.purchasePrice) : '',
    }))

    const buf = generateExcelBuffer({
      sheetName: 'Einkaufspreis-Vorlage',
      columns,
      rows,
    })

    return {
      filename: `einkaufspreis-vorlage-${dateStr}.xlsx`,
      base64: buf.toString('base64'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      count: items.length,
    }
  }

  // CSV format with UTF-8 BOM for German Excel compatibility
  const csvRows = items.map(p => ({
    SKU: p.sku,
    'Zusammengefasste SKUs': p.mappedSkusJoined || p.sku,
    Titel: p.title,
    Farbe: p.color || '',
    'Größe': p.size || '',
    EAN: p.ean || '',
    Lagerort: p.storageLocation || '',
    Bestand: String(Number(p.currentStock || 0)),
    'Verkaufspreis (Brutto)': formatGermanNumber(Number(p.price || 0)),
    Einkaufspreis:
      p.purchasePrice !== null && p.purchasePrice !== undefined
        ? formatGermanNumber(Number(p.purchasePrice))
        : '',
  }))

  const csvBody = Papa.unparse(csvRows, { quotes: true, delimiter: ';' })
  const csvWithBom = '\uFEFF' + csvBody

  return {
    filename: `einkaufspreis-vorlage-${dateStr}.csv`,
    base64: Buffer.from(csvWithBom, 'utf8').toString('base64'),
    mimeType: 'text/csv;charset=utf-8;',
    count: items.length,
  }
}

// ─── 2. Parse & Preview Uploaded Purchase Price Template (Excel or CSV) ───────
export type PurchasePricePreviewItem = {
  productId: string
  sku: string
  matchedVia: 'main_sku' | 'mapped_sku'
  uploadedSku: string
  title: string
  color: string | null
  size: string | null
  oldPurchasePrice: number | null
  newPurchasePrice: number | null
  priceChanged: boolean
  oldStock: number
  newStock: number | null
  stockChanged: boolean
  oldStorageLocation: string | null
  newStorageLocation: string | null
  storageLocationChanged: boolean
}

export async function previewPurchasePriceUploadAction(payload: {
  fileName: string
  base64Content: string
}) {
  const auth = await requireAuth()
  const rawBuffer = Buffer.from(payload.base64Content, 'base64')

  const isXlsx =
    payload.fileName.toLowerCase().endsWith('.xlsx') ||
    (rawBuffer.length >= 4 && rawBuffer.readUInt32LE(0) === 0x04034b50)

  let rawRows: Record<string, string>[] = []

  if (isXlsx) {
    rawRows = parseExcelBuffer(rawBuffer)
  } else {
    // Strip UTF-8 BOM if present, fallback to latin1 if UTF-8 produces replacement chars
    let csvText = rawBuffer.toString('utf8').replace(/^\uFEFF/, '')
    if (csvText.includes('\uFFFD')) {
      csvText = rawBuffer.toString('latin1').replace(/^\uFEFF/, '')
    }
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    })
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new Error('CSV Formatierungsfehler: ' + parsed.errors[0].message)
    }
    rawRows = parsed.data
  }

  if (rawRows.length === 0) {
    throw new Error('Die hochgeladene Datei enthält keine Datenzeilen.')
  }

  const normalizeSkuKey = (sku: string) => decodeExcelString(sku).trim().toLowerCase()
  const foldUmlauts = (sku: string) =>
    normalizeSkuKey(sku)
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')

  // Fetch company products & mappings to match both main SKUs and consolidated marketplace SKUs
  const allProducts = await fetchConsolidatedProductsWithMappings(auth.activeCompanyId)

  const mainSkuMap = new Map<string, (typeof allProducts)[0]>()
  const mappedSkuMap = new Map<string, (typeof allProducts)[0]>()
  const foldedSkuMap = new Map<string, (typeof allProducts)[0] | null>()

  const registerFolded = (folded: string, prod: (typeof allProducts)[0]) => {
    const existing = foldedSkuMap.get(folded)
    if (existing === undefined) {
      foldedSkuMap.set(folded, prod)
    } else if (existing !== null && existing.id !== prod.id) {
      // Mark ambiguous if two distinct products share the same umlaut-folded SKU
      foldedSkuMap.set(folded, null)
    }
  }

  for (const prod of allProducts) {
    const normMain = normalizeSkuKey(prod.sku)
    mainSkuMap.set(normMain, prod)
    registerFolded(foldUmlauts(prod.sku), prod)

    for (const mSku of prod.mappedSkusList) {
      const norm = normalizeSkuKey(mSku)
      if (!mappedSkuMap.has(norm)) {
        mappedSkuMap.set(norm, prod)
      }
      registerFolded(foldUmlauts(mSku), prod)
    }
  }

  // Helper to get column value case-insensitively (decoding XML entities in headers too)
  const getCol = (row: Record<string, string>, candidates: string[]): string | undefined => {
    const keys = Object.keys(row)
    for (const cand of candidates) {
      const normCand = normalizeSkuKey(cand)
      const foundKey = keys.find(k => normalizeSkuKey(k) === normCand)
      if (foundKey !== undefined) return row[foundKey]
    }
    return undefined
  }

  const previewItemsMap = new Map<string, PurchasePricePreviewItem>()
  const notFoundSkus: string[] = []
  let skippedEmptyPriceRows = 0

  for (const row of rawRows) {
    const rawSkuCell = getCol(row, [
      'SKU',
      'Haupt-SKU',
      'Zusammengefasste SKU',
      'Artikelnummer',
      'Art.-Nr.',
      'ArtNr',
      'Product SKU',
    ])
    const rawSku = rawSkuCell ? decodeExcelString(rawSkuCell).trim() : undefined

    if (
      !rawSku ||
      rawSku.toLowerCase() === 'gesamt' ||
      rawSku.toLowerCase() === 'summe' ||
      rawSku.toLowerCase() === 'gesamt / summe'
    ) {
      continue
    }

    const normSku = normalizeSkuKey(rawSku)
    let matchedProd = mainSkuMap.get(normSku)
    let matchedVia: 'main_sku' | 'mapped_sku' = 'main_sku'

    if (!matchedProd) {
      matchedProd = mappedSkuMap.get(normSku)
      matchedVia = 'mapped_sku'
    }

    if (!matchedProd) {
      // Check if 'Zusammengefasste SKUs' column has a matching SKU
      const rawMappedCol = getCol(row, ['Zusammengefasste SKUs'])
      if (rawMappedCol) {
        const parts = decodeExcelString(rawMappedCol)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        for (const part of parts) {
          const normPart = normalizeSkuKey(part)
          matchedProd = mainSkuMap.get(normPart) || mappedSkuMap.get(normPart)
          if (matchedProd) {
            matchedVia = 'mapped_sku'
            break
          }
        }
      }
    }

    if (!matchedProd) {
      // Unambiguous umlaut-folding fallback (e.g. Grün <-> Gruen)
      const foldedMatch = foldedSkuMap.get(foldUmlauts(rawSku))
      if (foldedMatch) {
        matchedProd = foldedMatch
        matchedVia = normalizeSkuKey(foldedMatch.sku) === normSku ? 'main_sku' : 'mapped_sku'
      }
    }

    if (!matchedProd) {
      if (!notFoundSkus.includes(rawSku)) {
        notFoundSkus.push(rawSku)
      }
      continue
    }

    const rawEk = getCol(row, [
      'Einkaufspreis',
      'Einkaufspreis (Einzel)',
      'Einkaufspreis (Einzel €)',
      'Einkaufspreis (€)',
      'EK',
      'EK-Preis',
      'EK (Netto)',
      'EK Netto',
      'Purchase Price',
      'Cost',
    ])

    const rawStock = getCol(row, ['Bestand', 'Aktueller Bestand', 'Lagerbestand', 'Menge', 'Stock'])
    const rawStorage = getCol(row, ['Lagerort', 'Storage Location'])

    const parsedEk = parseFlexibleNumber(rawEk)
    const parsedStock = parseFlexibleNumber(rawStock)
    const cleanStorage = rawStorage !== undefined ? decodeExcelString(rawStorage).trim() : undefined

    const oldEk =
      matchedProd.purchasePrice !== null && matchedProd.purchasePrice !== undefined
        ? Number(matchedProd.purchasePrice)
        : null
    const oldStock = Number(matchedProd.currentStock || 0)
    const oldStorage = matchedProd.storageLocation || null

    // If the EK cell in the template was left completely blank, check if stock or storage changed
    const ekProvided = rawEk !== undefined && String(rawEk).trim() !== '' && String(rawEk).trim() !== '-'
    const newEk = ekProvided && parsedEk !== null ? Math.max(0, Math.round(parsedEk * 100) / 100) : oldEk

    const priceChanged =
      ekProvided &&
      parsedEk !== null &&
      (oldEk === null || Math.abs(oldEk - newEk!) >= 0.005)

    const newStockVal = parsedStock !== null ? Math.max(0, Math.round(parsedStock)) : null
    const stockChanged = newStockVal !== null && newStockVal !== oldStock

    const newStorageVal = cleanStorage !== undefined ? (cleanStorage || null) : oldStorage
    const storageLocationChanged = cleanStorage !== undefined && (newStorageVal || '') !== (oldStorage || '')

    if (!ekProvided && !stockChanged && !storageLocationChanged) {
      skippedEmptyPriceRows++
    }

    previewItemsMap.set(matchedProd.id, {
      productId: matchedProd.id,
      sku: matchedProd.sku,
      matchedVia,
      uploadedSku: rawSku,
      title: matchedProd.title,
      color: matchedProd.color,
      size: matchedProd.size,
      oldPurchasePrice: oldEk,
      newPurchasePrice: ekProvided && parsedEk !== null ? newEk : oldEk,
      priceChanged,
      oldStock,
      newStock: newStockVal,
      stockChanged,
      oldStorageLocation: oldStorage,
      newStorageLocation: newStorageVal,
      storageLocationChanged,
    })
  }

  // Sort items so that rows with changed prices (or changed stock/storage) appear first in the preview
  const items = Array.from(previewItemsMap.values()).sort((a, b) => {
    const aRank = a.priceChanged ? 0 : a.stockChanged || a.storageLocationChanged ? 1 : a.newPurchasePrice !== null ? 2 : 3
    const bRank = b.priceChanged ? 0 : b.stockChanged || b.storageLocationChanged ? 1 : b.newPurchasePrice !== null ? 2 : 3
    if (aRank !== bRank) return aRank - bRank
    return a.sku.localeCompare(b.sku, 'de')
  })

  const changedPriceCount = items.filter(i => i.priceChanged).length
  const changedStockCount = items.filter(i => i.stockChanged).length
  const withValidPriceCount = items.filter(i => i.newPurchasePrice !== null).length

  return {
    totalRowsInFile: rawRows.length,
    matchedCount: items.length,
    changedPriceCount,
    changedStockCount,
    withValidPriceCount,
    skippedEmptyPriceRows,
    notFoundSkus,
    items,
  }
}

// ─── 3. Apply Purchase Price / Inventory Updates (from Template or Quick Edit) ─
export async function applyInventoryUpdatesAction(payload: {
  items: {
    productId: string
    purchasePrice?: number | null
    currentStock?: number | null
    storageLocation?: string | null
  }[]
  updatePurchasePrice?: boolean
  updateStock?: boolean
  updateStorageLocation?: boolean
}) {
  const auth = await requireAuth()
  const {
    items,
    updatePurchasePrice = true,
    updateStock = false,
    updateStorageLocation = false,
  } = payload

  if (!items || items.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  // Verify products belong to company
  const productIds = items.map(i => i.productId)
  const existingProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      currentStock: products.currentStock,
      purchasePrice: products.purchasePrice,
      storageLocation: products.storageLocation,
    })
    .from(products)
    .where(and(eq(products.companyId, auth.activeCompanyId), inArray(products.id, productIds)))

  const existingMap = new Map(existingProducts.map(p => [p.id, p]))
  let updatedCount = 0
  const stockUpdatesForSync: { sku: string; stock: number }[] = []

  await db.transaction(async tx => {
    for (const item of items) {
      const existing = existingMap.get(item.productId)
      if (!existing) continue

      const updateFields: Record<string, any> = {}

      if (updatePurchasePrice && item.purchasePrice !== undefined) {
        const formattedEk =
          item.purchasePrice === null || isNaN(item.purchasePrice)
            ? null
            : Math.max(0, item.purchasePrice).toFixed(2)
        if (formattedEk !== existing.purchasePrice) {
          updateFields.purchasePrice = formattedEk
        }
      }

      if (updateStock && item.currentStock !== undefined && item.currentStock !== null && !isNaN(item.currentStock)) {
        const safeStock = Math.max(0, Math.round(item.currentStock))
        if (String(safeStock) !== String(existing.currentStock)) {
          updateFields.currentStock = String(safeStock)
          stockUpdatesForSync.push({ sku: existing.sku, stock: safeStock })
        }
      }

      if (updateStorageLocation && item.storageLocation !== undefined) {
        const cleanLoc = item.storageLocation ? item.storageLocation.trim() : null
        if ((cleanLoc || null) !== (existing.storageLocation || null)) {
          updateFields.storageLocation = cleanLoc
        }
      }

      if (Object.keys(updateFields).length > 0) {
        updateFields.updatedAt = new Date()
        await tx
          .update(products)
          .set(updateFields)
          .where(and(eq(products.id, existing.id), eq(products.companyId, auth.activeCompanyId)))
        updatedCount++
      }
    }
  })

  if (stockUpdatesForSync.length > 0) {
    const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
    import('next/server')
      .then(({ after }) => {
        after(async () => {
          try {
            await pushUpdatesToMarketplaces(auth.activeCompanyId, stockUpdatesForSync)
          } catch (err) {
            console.error('[applyInventoryUpdatesAction] Failed to push stock updates:', err)
          }
        })
      })
      .catch(console.error)
  }

  revalidatePath('/products')
  revalidatePath('/products/inventory')

  return {
    success: true,
    updatedCount,
    syncedStockCount: stockUpdatesForSync.length,
  }
}

// ─── 4. Export Laufende Inventur as Excel (.xlsx) or CSV (.csv) ───────────────
export async function exportInventoryAction(options: {
  format: 'csv' | 'xlsx'
  productIds?: string[]
  stockFilter?: 'all' | 'in_stock' | 'out_of_stock'
  ekFilter?: 'all' | 'with_ek' | 'missing_ek'
}) {
  const auth = await requireAuth()
  let items = await fetchConsolidatedProductsWithMappings(auth.activeCompanyId)

  if (options.productIds && options.productIds.length > 0) {
    const idSet = new Set(options.productIds)
    items = items.filter(p => idSet.has(p.id))
  } else {
    if (options.stockFilter === 'in_stock') {
      items = items.filter(p => Number(p.currentStock || 0) > 0)
    } else if (options.stockFilter === 'out_of_stock') {
      items = items.filter(p => Number(p.currentStock || 0) <= 0)
    }

    if (options.ekFilter === 'with_ek') {
      items = items.filter(p => p.purchasePrice !== null && p.purchasePrice !== undefined && Number(p.purchasePrice) > 0)
    } else if (options.ekFilter === 'missing_ek') {
      items = items.filter(p => p.purchasePrice === null || p.purchasePrice === undefined || Number(p.purchasePrice) <= 0)
    }
  }

  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const stichtagFormatted = now.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  let totalStock = 0
  let totalEkValue = 0
  let totalVkGrossValue = 0
  let totalVkNetValue = 0

  const enrichedRows = items.map(p => {
    const stock = Math.max(0, Number(p.currentStock || 0))
    const ekUnit =
      p.purchasePrice !== null && p.purchasePrice !== undefined ? Number(p.purchasePrice) : null
    const vkGrossUnit = Number(p.price || 0)
    const taxRateNum = p.taxRate ? parseFloat(p.taxRate) : 0.19
    const vkNetUnit = taxRateNum > 0 ? vkGrossUnit / (1 + taxRateNum) : vkGrossUnit

    const ekTotal = ekUnit !== null ? stock * ekUnit : null
    const vkGrossTotal = stock * vkGrossUnit
    const vkNetTotal = stock * vkNetUnit

    const marginUnit = ekUnit !== null ? vkNetUnit - ekUnit : null
    const marginPercent = ekUnit !== null && vkNetUnit > 0 ? (vkNetUnit - ekUnit) / vkNetUnit : null

    totalStock += stock
    if (ekTotal !== null) totalEkValue += ekTotal
    totalVkGrossValue += vkGrossTotal
    totalVkNetValue += vkNetTotal

    return {
      sku: p.sku,
      mappedSkus: p.mappedSkusJoined || p.sku,
      marketplaces: p.marketplacesJoined || '-',
      title: p.title,
      color: p.color || '',
      size: p.size || '',
      ean: p.ean || '',
      category: p.category || '',
      brand: p.brand || '',
      storageLocation: p.storageLocation || '',
      stock,
      ekUnit,
      ekTotal,
      vkGrossUnit: Math.round(vkGrossUnit * 100) / 100,
      taxRatePercent: `${Math.round(taxRateNum * 100)}%`,
      vkNetUnit: Math.round(vkNetUnit * 100) / 100,
      vkGrossTotal: Math.round(vkGrossTotal * 100) / 100,
      vkNetTotal: Math.round(vkNetTotal * 100) / 100,
      marginUnit: marginUnit !== null ? Math.round(marginUnit * 100) / 100 : null,
      marginPercent: marginPercent !== null ? Math.round(marginPercent * 1000) / 1000 : null,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('de-DE') : '',
      stichtag: stichtagFormatted,
    }
  })

  if (options.format === 'xlsx') {
    const columns: ExcelColumnDef[] = [
      { header: 'SKU', key: 'sku', width: 20, type: 'string' },
      { header: 'Zusammengefasste SKUs', key: 'mappedSkus', width: 25, type: 'string' },
      { header: 'Marktplätze', key: 'marketplaces', width: 22, type: 'string' },
      { header: 'Titel', key: 'title', width: 36, type: 'string' },
      { header: 'Farbe', key: 'color', width: 14, type: 'string' },
      { header: 'Größe', key: 'size', width: 10, type: 'string' },
      { header: 'EAN', key: 'ean', width: 18, type: 'string' },
      { header: 'Marke', key: 'brand', width: 16, type: 'string' },
      { header: 'Kategorie', key: 'category', width: 18, type: 'string' },
      { header: 'Lagerort', key: 'storageLocation', width: 15, type: 'string' },
      { header: 'Bestand', key: 'stock', width: 12, type: 'integer' },
      { header: 'Einkaufspreis (Einzel)', key: 'ekUnit', width: 20, type: 'currency' },
      { header: 'Inventurwert EK (Gesamt)', key: 'ekTotal', width: 24, type: 'currency' },
      { header: 'VK Brutto (Einzel)', key: 'vkGrossUnit', width: 18, type: 'currency' },
      { header: 'MwSt.', key: 'taxRatePercent', width: 10, type: 'string' },
      { header: 'VK Netto (Einzel)', key: 'vkNetUnit', width: 18, type: 'currency' },
      { header: 'VK-Wert Brutto (Gesamt)', key: 'vkGrossTotal', width: 23, type: 'currency' },
      { header: 'VK-Wert Netto (Gesamt)', key: 'vkNetTotal', width: 23, type: 'currency' },
      { header: 'Rohertrag / Stück (Netto)', key: 'marginUnit', width: 22, type: 'currency' },
      { header: 'Marge (%)', key: 'marginPercent', width: 13, type: 'percent' },
      { header: 'Letzte Änderung', key: 'updatedAt', width: 16, type: 'string' },
      { header: 'Inventur-Stichtag', key: 'stichtag', width: 19, type: 'string' },
    ]

    const summaryRow = {
      sku: 'GESAMT / SUMME',
      mappedSkus: `${enrichedRows.length} SKUs`,
      marketplaces: '',
      title: '',
      color: '',
      size: '',
      ean: '',
      brand: '',
      category: '',
      storageLocation: '',
      stock: totalStock,
      ekUnit: '',
      ekTotal: Math.round(totalEkValue * 100) / 100,
      vkGrossUnit: '',
      taxRatePercent: '',
      vkNetUnit: '',
      vkGrossTotal: Math.round(totalVkGrossValue * 100) / 100,
      vkNetTotal: Math.round(totalVkNetValue * 100) / 100,
      marginUnit: '',
      marginPercent: '',
      updatedAt: '',
      stichtag: stichtagFormatted,
    }

    const buf = generateExcelBuffer({
      sheetName: `Inventur ${dateStr}`,
      columns,
      rows: enrichedRows,
      summaryRow,
    })

    return {
      filename: `laufende-inventur-${dateStr}.xlsx`,
      base64: buf.toString('base64'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      count: enrichedRows.length,
    }
  }

  // CSV Export with German formatting and summary row
  const csvData = enrichedRows.map(r => ({
    SKU: r.sku,
    'Zusammengefasste SKUs': r.mappedSkus,
    'Marktplätze': r.marketplaces,
    Titel: r.title,
    Farbe: r.color,
    'Größe': r.size,
    EAN: r.ean,
    Marke: r.brand,
    Kategorie: r.category,
    Lagerort: r.storageLocation,
    Bestand: String(r.stock),
    'Einkaufspreis (Einzel €)': r.ekUnit !== null ? formatGermanNumber(r.ekUnit) : '',
    'Inventurwert EK (Gesamt €)': r.ekTotal !== null ? formatGermanNumber(r.ekTotal) : '',
    'VK Brutto (Einzel €)': formatGermanNumber(r.vkGrossUnit),
    'MwSt.': r.taxRatePercent,
    'VK Netto (Einzel €)': formatGermanNumber(r.vkNetUnit),
    'VK-Wert Brutto (Gesamt €)': formatGermanNumber(r.vkGrossTotal),
    'VK-Wert Netto (Gesamt €)': formatGermanNumber(r.vkNetTotal),
    'Rohertrag / Stück (Netto €)': r.marginUnit !== null ? formatGermanNumber(r.marginUnit) : '',
    'Marge (%)': r.marginPercent !== null ? formatGermanNumber(r.marginPercent * 100, 1) + '%' : '',
    'Letzte Änderung': r.updatedAt,
    'Inventur-Stichtag': r.stichtag,
  }))

  // Add summary row at the end of CSV
  csvData.push({
    SKU: 'GESAMT / SUMME',
    'Zusammengefasste SKUs': `${enrichedRows.length} SKUs`,
    'Marktplätze': '',
    Titel: '',
    Farbe: '',
    'Größe': '',
    EAN: '',
    Marke: '',
    Kategorie: '',
    Lagerort: '',
    Bestand: String(totalStock),
    'Einkaufspreis (Einzel €)': '',
    'Inventurwert EK (Gesamt €)': formatGermanNumber(totalEkValue),
    'VK Brutto (Einzel €)': '',
    'MwSt.': '',
    'VK Netto (Einzel €)': '',
    'VK-Wert Brutto (Gesamt €)': formatGermanNumber(totalVkGrossValue),
    'VK-Wert Netto (Gesamt €)': formatGermanNumber(totalVkNetValue),
    'Rohertrag / Stück (Netto €)': '',
    'Marge (%)': '',
    'Letzte Änderung': '',
    'Inventur-Stichtag': stichtagFormatted,
  })

  const csvString = '\uFEFF' + Papa.unparse(csvData, { quotes: true, delimiter: ';' })

  return {
    filename: `laufende-inventur-${dateStr}.csv`,
    base64: Buffer.from(csvString, 'utf8').toString('base64'),
    mimeType: 'text/csv;charset=utf-8;',
    count: enrichedRows.length,
  }
}
