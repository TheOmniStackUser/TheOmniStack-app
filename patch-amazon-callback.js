const fs = require('fs')
const file = 'src/app/api/auth/amazon/callback/route.ts'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  'updatedAt: new Date(),',
  'updatedAt: new Date(),\\n          isActive: true,'
)
fs.writeFileSync(file, content)
