const fs = require('fs')
const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. pushAllInventoryToMarketplaces
content = content.replace(
  'msrp: products.msrp\\n          })',
  'msrp: products.msrp,\\n            saleStartDate: products.saleStartDate,\\n            saleEndDate: products.saleEndDate\\n          })'
)
content = content.replace(
  'msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined\\n  }))',
  'msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined,\\n    saleStartDate: p.saleStartDate,\\n    saleEndDate: p.saleEndDate\\n  }))'
)

// 2. triggerMarketplaceSyncForProducts
content = content.replace(
  'msrp: products.msrp\\n    })',
  'msrp: products.msrp,\\n      saleStartDate: products.saleStartDate,\\n      saleEndDate: products.saleEndDate\\n    })'
)
content = content.replace(
  'msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined\\n  }))',
  'msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined,\\n    saleStartDate: p.saleStartDate,\\n    saleEndDate: p.saleEndDate\\n  }))'
)

fs.writeFileSync(file, content)
