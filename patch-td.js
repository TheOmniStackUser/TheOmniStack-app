const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// We need to add MsrpEditor before PriceEditor
content = content.replace(
  /<td className="px-6 py-4">\s*<PriceEditor product={product} \/>\s*<\/td>/,
  '<td className="px-6 py-4">\n                        <MsrpEditor product={product} />\n                      </td>\n                      <td className="px-6 py-4">\n                        <PriceEditor product={product} />\n                      </td>'
)

fs.writeFileSync(file, content)
