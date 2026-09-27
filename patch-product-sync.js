const fs = require('fs')
const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  /let modifiedPrice = updateDef\.msrp !== undefined \? updateDef\.msrp : \(centralProduct\.msrp \? parseFloat\(centralProduct\.msrp\) : undefined\)/,
  'let modifiedPrice = updateDef.price !== undefined ? updateDef.price : (centralProduct.price ? parseFloat(centralProduct.price) : undefined)'
)

content = content.replace(
  /let modifiedReducedPrice = updateDef\.price !== undefined \? updateDef\.price : \(centralProduct\.price \? parseFloat\(centralProduct\.price\) : undefined\)/,
  'let modifiedReducedPrice = updateDef.reducedPrice !== undefined ? updateDef.reducedPrice : (centralProduct.reducedPrice ? parseFloat(centralProduct.reducedPrice) : undefined)\n    let modifiedMsrp = updateDef.msrp !== undefined ? updateDef.msrp : (centralProduct.msrp ? parseFloat(centralProduct.msrp) : undefined)'
)

content = content.replace(
  /if \(mUpdate\.price === undefined && modifiedPrice !== undefined\) \{\n\s*mUpdate\.price = modifiedPrice\n\s*\}/,
  'if (mUpdate.price === undefined && modifiedPrice !== undefined) {\n          mUpdate.price = modifiedPrice\n        }\n        if (mUpdate.msrp === undefined && modifiedMsrp !== undefined) {\n          mUpdate.msrp = modifiedMsrp\n        }'
)

content = content.replace(
  /if \(updateDef\.msrp !== undefined \|\| updateDef\.price !== undefined\) \{/,
  'if (modifiedMsrp !== undefined) mUpdate.msrp = modifiedMsrp\n    if (updateDef.msrp !== undefined || updateDef.price !== undefined || updateDef.reducedPrice !== undefined) {'
)

content = content.replace(
  /updatesByIntegration: Record<string, \{ sku: string, marketplaceProductId\?: string, stock\?: number, price\?: number, reducedPrice\?: number \}\[\]>/,
  'updatesByIntegration: Record<string, { sku: string, marketplaceProductId?: string, stock?: number, price?: number, reducedPrice?: number, msrp?: number }[]>'
)

fs.writeFileSync(file, content)
