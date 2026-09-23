const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/workers/product-sync.ts')
let content = fs.readFileSync(file, 'utf8')

content = content.replace(/      currentIndex\+\+\n      continue/g, '      currentIndex++\n      return')

fs.writeFileSync(file, content)
