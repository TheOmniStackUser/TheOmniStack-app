const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/app/(dashboard)/products/products-client.tsx')
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  'showToast(`Sync teilweise fehlgeschlagen (${result.failedMarketplaces.join(\', \')})`, \'error\')',
  'showToast(`Sync teilweise fehlgeschlagen (${result.failedMarketplaces.map((f: any) => f.name).join(\', \')})`, \'error\')'
)

fs.writeFileSync(file, content)
