const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/app/actions/products.ts')
let content = fs.readFileSync(file, 'utf8')

const bulkActionCode = `
export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number) {
  const auth = await requireAuth()
  if (productIds.length === 0) return { success: true }

  const updates: Partial<{ currentStock: string; price: string; updatedAt: Date }> = { updatedAt: new Date() }
  let safeStock: number | undefined
  let safePrice: number | undefined

  if (newStock !== undefined) {
    safeStock = Math.max(0, newStock)
    updates.currentStock = safeStock.toString()
  }
  
  if (newPrice !== undefined) {
    safePrice = Math.max(0, newPrice)
    updates.price = safePrice.toString()
  }

  if (Object.keys(updates).length === 1) {
    // Only updatedAt was set, nothing to do
    return { success: true }
  }

  // Get products to find their SKUs for syncing
  const { inArray } = await import('drizzle-orm')
  const selectedProducts = await db.select({ sku: products.sku, id: products.id })
    .from(products)
    .where(and(inArray(products.id, productIds), eq(products.companyId, auth.activeCompanyId)))

  if (selectedProducts.length === 0) return { success: true }

  // Update DB
  await db.update(products)
    .set(updates)
    .where(and(inArray(products.id, productIds), eq(products.companyId, auth.activeCompanyId)))

  // Trigger Sync
  const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
  import('next/server').then(({ after }) => {
    after(async () => {
      try {
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice
        }))
        await pushUpdatesToMarketplaces(auth.activeCompanyId, syncPayload)
      } catch (error) {
        console.error('[bulkUpdateStockAndPrice] Background sync failed:', error)
      }
    })
  }).catch(console.error)

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/products')

  return { success: true }
}
`

if (!content.includes('bulkUpdateStockAndPrice')) {
  content += '\n' + bulkActionCode
  fs.writeFileSync(file, content)
  console.log("Added bulkUpdateStockAndPrice action")
} else {
  console.log("bulkUpdateStockAndPrice already exists")
}
