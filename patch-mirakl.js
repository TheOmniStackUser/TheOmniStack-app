const fs = require('fs')
const file = 'src/adapters/marketplace/mirakl.ts'
let content = fs.readFileSync(file, 'utf8')

const oldCode = `            const startDate = new Date();
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 10); // 10 years from now
            
            offer.discount = {
              discount_price: update.reducedPrice,
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString()
            }`

const newCode = `            offer.discount = {
              discount_price: update.reducedPrice,
              start_date: update.saleStartDate ? update.saleStartDate.toISOString() : new Date().toISOString(),
              end_date: update.saleEndDate ? update.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
            }`

content = content.replace(oldCode, newCode)
fs.writeFileSync(file, content)
