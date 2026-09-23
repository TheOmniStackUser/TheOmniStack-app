const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// Modify PriceEditor to edit MSRP
content = content.replace(/function PriceEditor\(\{ product \}: \{ product: Product \}\) \{[\s\S]*?export function ProductsClient/m, (match) => {
  let m = match
  // PriceEditor should edit MSRP
  m = m.replace(/function PriceEditor/g, "function PriceEditorTmp")
  m = m.replace(/product\.price/g, "product.msrp")
  m = m.replace(/updateProductPriceInline\(product\.id, numericValue\)/g, "bulkUpdateStockAndPrice([product.id], undefined, undefined, undefined, numericValue)")
  m = m.replace(/function PriceEditorTmp/g, "function PriceEditor")

  // ReducedPriceEditor should edit PRICE
  m = m.replace(/function ReducedPriceEditor\(\{ product \}: \{ product: Product \}\) \{[\s\S]*?<\/div>\n  \)\n\}/m, (match2) => {
    let m2 = match2
    m2 = m2.replace(/product\.reducedPrice/g, "product.price")
    m2 = m2.replace(/undefined, undefined, numericValue\)/g, "undefined, numericValue)")
    return m2
  })
  
  return m
})

fs.writeFileSync(file, content)
console.log("Patched products-client.tsx for msrp and price")
