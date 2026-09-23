const fs = require('fs')
const file = 'src/app/widerruf/actions.ts'
let content = fs.readFileSync(file, 'utf8')
content = content.replace(/\\`/g, "`")
content = content.replace(/\\\$/g, "$")
fs.writeFileSync(file, content)
