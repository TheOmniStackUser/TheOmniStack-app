const fs = require('fs')
const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. signature
content = content.replace(
  'export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number, newReducedPrice?: number, newMsrp?: number)',
  'export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number, newReducedPrice?: number, newMsrp?: number, newSaleStartDate?: Date | null, newSaleEndDate?: Date | null)'
)

// 2. updates type
content = content.replace(
  'updates: Partial<{ currentStock: string; price: string; reducedPrice: string | null; msrp: string | null; updatedAt: Date }>',
  'updates: Partial<{ currentStock: string; price: string; reducedPrice: string | null; msrp: string | null; saleStartDate: Date | null; saleEndDate: Date | null; updatedAt: Date }>'
)

// 3. Set updates values
const msrpLogic = `
  if (newMsrp !== undefined) {
    if (newMsrp === 0 || newMsrp === null) {
      updates.msrp = null
      safeMsrp = 0
    } else {
      safeMsrp = Math.max(0, newMsrp)
      updates.msrp = safeMsrp.toString()
    }
  }
`
const datesLogic = `
  if (newSaleStartDate !== undefined) {
    updates.saleStartDate = newSaleStartDate
  }
  if (newSaleEndDate !== undefined) {
    updates.saleEndDate = newSaleEndDate
  }
`
content = content.replace(msrpLogic.trim(), msrpLogic.trim() + '\\n' + datesLogic.trim())

// 4. sync payload
const syncPayloadOld = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice,
          msrp: safeMsrp
        }))
`
const syncPayloadNew = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice,
          msrp: safeMsrp,
          saleStartDate: newSaleStartDate,
          saleEndDate: newSaleEndDate
        }))
`
content = content.replace(syncPayloadOld.trim(), syncPayloadNew.trim())

fs.writeFileSync(file, content)
