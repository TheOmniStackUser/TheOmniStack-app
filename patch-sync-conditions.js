const fs = require('fs')

const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

const replacement = `
    if (canSyncPrice && mapping.syncPrice) {
      if (updateDef.price !== undefined) {
        mUpdate.price = modifiedPrice
      }
      if (updateDef.reducedPrice !== undefined) {
        mUpdate.reducedPrice = modifiedReducedPrice
        // Ensure price is also sent if reducedPrice is sent
        if (mUpdate.price === undefined && modifiedPrice !== undefined) {
          mUpdate.price = modifiedPrice
        }
        if (mUpdate.msrp === undefined && modifiedMsrp !== undefined) {
          mUpdate.msrp = modifiedMsrp
        }
      }
    }
`

content = content.replace(
  /if \(canSyncPrice && mapping\.syncPrice\) \{\s*if \(updateDef\.msrp !== undefined\) \{\s*mUpdate\.price = modifiedPrice\s*\}\s*if \(updateDef\.price !== undefined\) \{\s*mUpdate\.reducedPrice = modifiedReducedPrice\s*\/\/ Ensure price is also sent if reducedPrice is sent\s*if \(mUpdate\.price === undefined && modifiedPrice !== undefined\) \{\s*mUpdate\.price = modifiedPrice\s*\}\s*if \(mUpdate\.msrp === undefined && modifiedMsrp !== undefined\) \{\s*mUpdate\.msrp = modifiedMsrp\s*\}\s*\}\s*\}/,
  replacement
)

fs.writeFileSync(file, content)
