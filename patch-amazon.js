const fs = require('fs')
const file = 'src/adapters/marketplace/amazon.ts'
let content = fs.readFileSync(file, 'utf8')

const oldCode = `          if (update.reducedPrice) {
            offerValue.discounted_price = [{
              schedule: [{
                value_with_tax: update.reducedPrice
              }]
            }]
          }`

const newCode = `          if (update.reducedPrice) {
            offerValue.discounted_price = [{
              schedule: [{
                value_with_tax: update.reducedPrice,
                start_at: update.saleStartDate ? update.saleStartDate.toISOString() : new Date().toISOString(),
                end_at: update.saleEndDate ? update.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
              }]
            }]
          }`

content = content.replace(oldCode, newCode)
fs.writeFileSync(file, content)
