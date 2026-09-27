const fs = require('fs')
const file = 'src/adapters/marketplace/amazon.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  'currency: "EUR",',
  'marketplace_id: this.marketplaceId,\\n            currency: "EUR",'
)
fs.writeFileSync(file, content)
console.log("Patched amazon")
