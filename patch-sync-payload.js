const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

const oldLogic = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice,
          reducedPrice: safeReducedPrice === 0 ? undefined : safeReducedPrice // 0 means remove sale price
        }))
`

const newLogic = `
        const syncPayload = selectedProducts.map(p => ({
          sku: p.sku,
          stock: safeStock,
          price: safePrice,
          msrp: safeMsrp
        }))
`

content = content.replace(oldLogic.trim(), newLogic.trim())
fs.writeFileSync(file, content)
console.log("Patched syncPayload")
