const fs = require('fs')

const file = 'src/adapters/marketplace/amazon.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace('price?: number', 'price?: number; reducedPrice?: number')

const oldPriceLogic = `
        if (update.price !== undefined) {
          patches.push({
            op: "replace",
            path: "/attributes/purchasable_offer",
            value: [{
              currency: "EUR",
              our_price: [{
                schedule: [{
                  value_with_tax: update.price
                }]
              }]
            }]
          })
        }
`

const newPriceLogic = `
        if (update.price !== undefined || update.reducedPrice !== undefined) {
          const offerValue: any = {
            currency: "EUR",
            our_price: [{
              schedule: [{
                value_with_tax: update.price !== undefined ? update.price : update.fallbackPrice
              }]
            }]
          }
          if (update.reducedPrice) {
            offerValue.discounted_price = [{
              schedule: [{
                value_with_tax: update.reducedPrice
              }]
            }]
          }
          patches.push({
            op: "replace",
            path: "/attributes/purchasable_offer",
            value: [offerValue]
          })
        }
`

if (content.includes('op: "replace",\n            path: "/attributes/purchasable_offer",')) {
  content = content.replace(oldPriceLogic.trim(), newPriceLogic.trim())
}

fs.writeFileSync(file, content)
console.log("Patched amazon.ts")
