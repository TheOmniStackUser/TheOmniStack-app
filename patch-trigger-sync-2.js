const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(/price: products\.price\n\s*\}/g, "price: products.price,\n      msrp: products.msrp\n    }")

fs.writeFileSync(file, content)
console.log("Patched trigger-sync-2")
