const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// 1. In PriceEditor, it edits `price`. But now we want the first column to edit `msrp`.
content = content.replace('function PriceEditor({ product }: { product: Product }) {', 'function MsrpEditor({ product }: { product: Product }) {')
content = content.replace(/product\.price/g, 'product.msrp')
content = content.replace(/product\.msrp \? Number\(product\.msrp\)\.toFixed\(2\)/g, "product.msrp ? Number(product.msrp).toFixed(2)")
// Wait, I can't just replace `product.price` because there is `Number(product.price || 0)`.
// Let's do it carefully.
