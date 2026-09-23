const fs = require('fs')
const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  'updates: { sku: string, stock?: number, price?: number, msrp?: number, saleStartDate?: string | null, saleEndDate?: string | null }[]',
  'updates: { sku: string, stock?: number, price?: number, msrp?: number, saleStartDate?: Date | null, saleEndDate?: Date | null }[]'
)
fs.writeFileSync(file, content)
