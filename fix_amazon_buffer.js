const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/adapters/marketplace/amazon.ts')
let content = fs.readFileSync(file, 'utf8')

// Replace the previous patch
content = content.replace('body: new Blob([pdfBuffer], { type: "application/pdf" })', 'body: pdfBuffer as unknown as BodyInit')
content = content.replace('body: new Blob([pdfBuffer], { type: "application/pdf" }) as any', 'body: pdfBuffer as unknown as BodyInit')

fs.writeFileSync(file, content)
console.log("Patched amazon.ts")
