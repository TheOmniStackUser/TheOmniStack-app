const fs = require('fs')

const file = 'src/adapters/marketplace/base.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace('price?: number; fallbackPrice?: number', 'price?: number; reducedPrice?: number; fallbackPrice?: number')
fs.writeFileSync(file, content)
console.log("Patched base.ts")
