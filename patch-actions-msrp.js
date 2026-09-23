const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace('export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number, newReducedPrice?: number)', 'export async function bulkUpdateStockAndPrice(productIds: string[], newStock?: number, newPrice?: number, newReducedPrice?: number, newMsrp?: number)')

content = content.replace('let safePrice: number | undefined\n  let safeReducedPrice: number | undefined', 'let safePrice: number | undefined\n  let safeReducedPrice: number | undefined\n  let safeMsrp: number | undefined')

content = content.replace('updates: Partial<{ currentStock: string; price: string; reducedPrice: string | null; updatedAt: Date }>', 'updates: Partial<{ currentStock: string; price: string; reducedPrice: string | null; msrp: string | null; updatedAt: Date }>')

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

content = content.replace(/if \(newPrice !== undefined\) {/, msrpLogic.trim() + '\n  if (newPrice !== undefined) {')

fs.writeFileSync(file, content)
console.log("Patched actions/products.ts for msrp")
