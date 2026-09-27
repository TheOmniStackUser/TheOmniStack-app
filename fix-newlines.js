const fs = require('fs')

function fix(file) {
  let content = fs.readFileSync(file, 'utf8')
  // Fix the multiline join string
  content = content.replace(/join\('\n'\)/g, "join('\\n')")
  fs.writeFileSync(file, content)
}

fix('src/adapters/marketplace/amazon.ts')
