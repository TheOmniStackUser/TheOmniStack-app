const fs = require('fs')

const file = 'src/db/schema/products.ts'
let content = fs.readFileSync(file, 'utf8')

const target = "reducedPrice: numeric('reduced_price', { precision: 12, scale: 2 }),"
const replace = target + "\n  saleStartDate: timestamp('sale_start_date', { withTimezone: true }),\n  saleEndDate: timestamp('sale_end_date', { withTimezone: true }),"

content = content.replace(target, replace)
fs.writeFileSync(file, content)
console.log("Patched schema")
