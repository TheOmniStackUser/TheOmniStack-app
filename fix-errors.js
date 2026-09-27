const fs = require('fs')

// Fix products-client.tsx
const clientFile = 'src/app/(dashboard)/products/products-client.tsx'
let clientContent = fs.readFileSync(clientFile, 'utf8')
clientContent = clientContent.replace('{selectedIds.length === 2 && (', '{selectedProductIds.size === 2 && (')
clientContent = clientContent.replace('productsToMerge={products.filter(p => selectedIds.includes(p.id))}', 'productsToMerge={products.filter(p => selectedProductIds.has(p.id))}')
clientContent = clientContent.replace('setSelectedIds([])', 'setSelectedProductIds(new Set())')
fs.writeFileSync(clientFile, clientContent)

// Fix products.ts
const actionsFile = 'src/app/actions/products.ts'
let actionsContent = fs.readFileSync(actionsFile, 'utf8')
actionsContent = actionsContent.replace('const { companyId } = await requireAuth()', 'const auth = await requireAuth()\n  const companyId = auth.activeCompanyId')
fs.writeFileSync(actionsFile, actionsContent)

