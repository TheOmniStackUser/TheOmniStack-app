const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

// Fix select
content = content.replace(
  /price: products\.price,\s*msrp: products\.msrp/,
  'price: products.price,\n      msrp: products.msrp,\n      reducedPrice: products.reducedPrice,\n      saleStartDate: products.saleStartDate,\n      saleEndDate: products.saleEndDate'
)

// Fix payload mapping
content = content.replace(
  /msrp: p\.msrp !== null && p\.msrp !== undefined \? Number\(p\.msrp\) : undefined/,
  'msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined,\n    reducedPrice: p.reducedPrice !== null && p.reducedPrice !== undefined ? Number(p.reducedPrice) : undefined,\n    saleStartDate: p.saleStartDate ? p.saleStartDate : undefined,\n    saleEndDate: p.saleEndDate ? p.saleEndDate : undefined'
)

fs.writeFileSync(file, content)
