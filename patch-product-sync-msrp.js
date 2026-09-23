const fs = require('fs')

const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. Signature
content = content.replace('updates: { sku: string, stock?: number, price?: number, reducedPrice?: number }[]', 'updates: { sku: string, stock?: number, price?: number, msrp?: number }[]')

// 2. Logic replacement
const oldLogic = `
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
`

const newLogic = `
    // MSRP -> Standard Price (Marketplace price)
    let modifiedPrice = updateDef.msrp !== undefined ? updateDef.msrp : (centralProduct.msrp ? parseFloat(centralProduct.msrp) : undefined)
    if (modifiedPrice !== undefined) {
      if (mapping.priceModifierType === 'fixed') {
        modifiedPrice += parseFloat(mapping.priceModifierValue?.toString() || '0')
      } else if (mapping.priceModifierType === 'percentage') {
        const percent = parseFloat(mapping.priceModifierValue?.toString() || '0')
        modifiedPrice = modifiedPrice * (1 + percent / 100)
      }
    }

    // Price -> Sales Price (Marketplace reducedPrice)
    let modifiedReducedPrice = updateDef.price !== undefined ? updateDef.price : (centralProduct.price ? parseFloat(centralProduct.price) : undefined)
    if (modifiedReducedPrice !== undefined && modifiedReducedPrice > 0) {
      if (mapping.priceModifierType === 'fixed') {
        modifiedReducedPrice += parseFloat(mapping.priceModifierValue?.toString() || '0')
      } else if (mapping.priceModifierType === 'percentage') {
        const percent = parseFloat(mapping.priceModifierValue?.toString() || '0')
        modifiedReducedPrice = modifiedReducedPrice * (1 + percent / 100)
      }
    } else if (modifiedReducedPrice === 0) {
        modifiedReducedPrice = 0 // 0 means remove sale price
    }

    if (canSyncPrice && mapping.syncPrice) {
      if (updateDef.msrp !== undefined) {
        mUpdate.price = modifiedPrice
      }
      if (updateDef.price !== undefined) {
        mUpdate.reducedPrice = modifiedReducedPrice
        // Ensure price is also sent if reducedPrice is sent
        if (mUpdate.price === undefined && modifiedPrice !== undefined) {
          mUpdate.price = modifiedPrice
        }
      }
    }

    if (updateDef.msrp !== undefined || updateDef.price !== undefined) {
      (mUpdate as any).fallbackPrice = modifiedPrice || 0
    }
`

content = content.replace(oldLogic.trim(), newLogic.trim())

fs.writeFileSync(file, content)
console.log("Patched product-sync.ts for MSRP")
