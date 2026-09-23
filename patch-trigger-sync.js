const fs = require('fs')

const file = 'src/app/actions/products.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. pushAllInventoryToMarketplaces
content = content.replace('price: products.price\n          })', 'price: products.price,\n            msrp: products.msrp\n          })')
content = content.replace('price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined\n  }))', 'price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined,\n    msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined\n  }))')

// 2. triggerMarketplaceSyncForProducts
content = content.replace('price: products.price\n    })', 'price: products.price,\n      msrp: products.msrp\n    })')
content = content.replace('price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined\n  }))', 'price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined,\n    msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined\n  }))')

fs.writeFileSync(file, content)
console.log("Patched trigger-sync")
