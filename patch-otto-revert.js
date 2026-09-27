const fs = require('fs')

const file = 'src/adapters/marketplace/otto.ts'
let content = fs.readFileSync(file, 'utf8')

const oldCode = `        if (u.reducedPrice && u.reducedPrice > 0) {
          payload.promotionalPrice = {
            amount: u.reducedPrice,
            currency: 'EUR',
            startDate: u.saleStartDate ? u.saleStartDate.toISOString() : new Date().toISOString(),
            endDate: u.saleEndDate ? u.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }`

const newCode = `        if (u.reducedPrice && u.reducedPrice > 0) {
          // Format date without milliseconds as required by Otto API v5: yyyy-MM-dd'T'HH:mm:ssZ
          const formatDate = (d) => d.toISOString().replace(/\\.\\d{3}Z$/, 'Z')
          
          let start = u.saleStartDate ? new Date(u.saleStartDate) : new Date()
          // Ensure start date is not in the past!
          if (start < new Date()) {
            start = new Date()
          }

          let end = u.saleEndDate ? new Date(u.saleEndDate) : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
          
          payload.sale = {
            salePrice: {
              amount: u.reducedPrice,
              currency: 'EUR'
            },
            startDate: formatDate(start),
            endDate: formatDate(end)
          }
        }`

content = content.replace(oldCode, newCode)

fs.writeFileSync(file, content)
