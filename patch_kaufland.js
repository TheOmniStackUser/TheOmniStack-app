const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/adapters/marketplace/kaufland.ts')
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  "await this.makeRequest('PATCH', `/units/${idUnit}`, JSON.stringify(patchBody))",
  "await this.makeRequest('PATCH', `/units/${idUnit}`, JSON.stringify(patchBody), { storefront: this.storefront })"
)

fs.writeFileSync(file, content)
