const fs = require('fs')

const file = 'src/adapters/marketplace/otto.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace('updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]', 'updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number; reducedPrice?: number; fallbackPrice?: number }[]')

const oldPriceLogic = `
      const priceUpdates = updates.filter(u => u.price !== undefined).map(u => ({
        sku: u.sku,
        standardPrice: {
          amount: u.price,
          currency: 'EUR'
        }
      }))
`
const newPriceLogic = `
      const priceUpdates = updates.filter(u => u.price !== undefined || u.reducedPrice !== undefined).map(u => {
        const payload: any = {
          sku: u.sku,
          standardPrice: {
            amount: u.price !== undefined ? u.price : u.fallbackPrice,
            currency: 'EUR'
          }
        }
        if (u.reducedPrice) {
          payload.sale = {
            salePrice: {
              amount: u.reducedPrice,
              currency: 'EUR'
            }
          }
        }
        return payload
      })
`
content = content.replace(oldPriceLogic.trim(), newPriceLogic.trim())

fs.writeFileSync(file, content)
console.log("Patched otto.ts")
