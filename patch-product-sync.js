const fs = require('fs')

const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. Signature
content = content.replace('updates: { sku: string, stock?: number, price?: number }[]', 'updates: { sku: string, stock?: number, price?: number, reducedPrice?: number }[]')

// 2. DB fetch
content = content.replace('select({ id: products.id, sku: products.sku })', 'select({ id: products.id, sku: products.sku, reducedPrice: products.reducedPrice, price: products.price })')

// 3. updatesByIntegration type
content = content.replace('updatesByIntegration: Record<string, { sku: string, marketplaceProductId?: string, stock?: number, price?: number }[]>', 'updatesByIntegration: Record<string, { sku: string, marketplaceProductId?: string, stock?: number, price?: number, reducedPrice?: number }[]>')

// 4. mapping logic
const priceLogic = `
    let modifiedPrice = updateDef.price
    if (modifiedPrice !== undefined) {
      if (mapping.priceModifierType === 'fixed') {
        modifiedPrice += parseFloat(mapping.priceModifierValue?.toString() || '0')
      } else if (mapping.priceModifierType === 'percentage') {
        const percent = parseFloat(mapping.priceModifierValue?.toString() || '0')
        modifiedPrice = modifiedPrice * (1 + percent / 100)
      }
    }

    let modifiedReducedPrice = updateDef.reducedPrice
    if (modifiedReducedPrice !== undefined) {
      if (mapping.priceModifierType === 'fixed') {
        modifiedReducedPrice += parseFloat(mapping.priceModifierValue?.toString() || '0')
      } else if (mapping.priceModifierType === 'percentage') {
        const percent = parseFloat(mapping.priceModifierValue?.toString() || '0')
        modifiedReducedPrice = modifiedReducedPrice * (1 + percent / 100)
      }
    }

    if (canSyncPrice && mapping.syncPrice) {
      if (updateDef.price !== undefined) {
        mUpdate.price = modifiedPrice
      }
      if (updateDef.reducedPrice !== undefined) {
        mUpdate.reducedPrice = modifiedReducedPrice
        // Ensure price is also sent if reducedPrice is sent, fallback to central DB price
        if (mUpdate.price === undefined && centralProduct.price) {
          mUpdate.price = parseFloat(centralProduct.price)
        }
      }
    }

    if (modifiedPrice !== undefined || modifiedReducedPrice !== undefined) {
      (mUpdate as any).fallbackPrice = modifiedPrice || parseFloat(centralProduct.price || '0')
    }

    if (mUpdate.stock !== undefined || mUpdate.price !== undefined || mUpdate.reducedPrice !== undefined) {
      updatesByIntegration[intId].push(mUpdate)
    }
`

const oldPriceLogicRegex = /let modifiedPrice = updateDef\.price[\s\S]*?updatesByIntegration\[intId\]\.push\(mUpdate\)\n    }/
content = content.replace(oldPriceLogicRegex, priceLogic.trim())

// 5. Update log payload
content = content.replace('...(u.price !== undefined ? { price: u.price } : {})', '...(u.price !== undefined ? { price: u.price } : {}),\n      ...(u.reducedPrice !== undefined ? { reducedPrice: u.reducedPrice } : {})')

fs.writeFileSync(file, content)
console.log("Patched product-sync.ts")
