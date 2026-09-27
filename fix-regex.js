const fs = require('fs')

function fix(file) {
  let content = fs.readFileSync(file, 'utf8')
  content = content.replace(/\.split\(\/\\r\?\n\/\)/g, ".split(/\\r?\\n/)")
  fs.writeFileSync(file, content)
}

fix('src/adapters/marketplace/amazon.ts')
