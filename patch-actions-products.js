const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. Update bulkUpdateStockAndPrice signature
content = content.replace('export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number) {', 'export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number, newReducedPrice?: number) {')

// 2. Add safeReducedPrice
content = content.replace('let safePrice: number | undefined', 'let safePrice: number | undefined\n  let safeReducedPrice: number | undefined')

// 3. Add to updates object type
content = content.replace('updates: Partial<{ currentStock: string; price: string; updatedAt: Date }>', 'updates: Partial<{ currentStock: string; price: string; reducedPrice: string | null; updatedAt: Date }>')

// 4. Add logic for newReducedPrice
const priceLogic = `
  if (newPrice !== undefined) {
    safePrice = Math.max(0, newPrice)
    updates.price = safePrice.toString()
  }
  
  if (newReducedPrice !== undefined) {
    if (newReducedPrice === 0 || newReducedPrice === null) {
      updates.reducedPrice = null
      safeReducedPrice = 0
    } else {
      safeReducedPrice = Math.max(0, newReducedPrice)
      updates.reducedPrice = safeReducedPrice.toString()
    }
  }
`
content = content.replace(/if \(newPrice !== undefined\) {[\s\S]*?updates\.price = safePrice\.toString\(\)\n  }/, priceLogic.trim())

// 5. Add to sync payload
const syncPayloadOld = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice
        }))
`
const syncPayloadNew = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice,
          reducedPrice: safeReducedPrice === 0 ? undefined : safeReducedPrice // 0 means remove sale price
        }))
`
content = content.replace(syncPayloadOld, syncPayloadNew)

fs.writeFileSync(file, content)
console.log("Patched actions/products.ts")
