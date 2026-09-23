const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

const oldLogic = `
      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice, newReducedPrice)
`
const newLogic = `
      // newPrice comes from bulkPrice (which is "Normaler Preis" / UVP -> newMsrp)
      // newReducedPrice comes from bulkReducedPrice (which is "Aktions-Preis" -> newPrice)
      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newReducedPrice, undefined, newPrice)
`
content = content.replace(oldLogic.trim(), newLogic.trim())
fs.writeFileSync(file, content)
console.log("Patched handleBulkEditSubmit")
