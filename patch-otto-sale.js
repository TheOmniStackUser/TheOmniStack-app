const fs = require('fs')

const file = 'src/adapters/marketplace/otto.ts'
let content = fs.readFileSync(file, 'utf8')

// Replace sale: { salePrice: { ... } ... } with promotionalPrice: { ... }
const oldCode = `        if (u.reducedPrice && u.reducedPrice > 0) {
          payload.sale = {
            salePrice: {
              amount: u.reducedPrice,
              currency: 'EUR'
            },
            startDate: u.saleStartDate ? u.saleStartDate.toISOString() : new Date().toISOString(),
            endDate: u.saleEndDate ? u.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }`

const newCode = `        if (u.reducedPrice && u.reducedPrice > 0) {
          payload.promotionalPrice = {
            amount: u.reducedPrice,
            currency: 'EUR',
            startDate: u.saleStartDate ? u.saleStartDate.toISOString() : new Date().toISOString(),
            endDate: u.saleEndDate ? u.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }`

content = content.replace(oldCode, newCode)

fs.writeFileSync(file, content)
