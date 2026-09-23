const fs = require('fs')
const file = 'src/workers/product-sync.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. Types
content = content.replace(
  'updates: { sku: string, stock?: number, price?: number, msrp?: number }[]',
  'updates: { sku: string, stock?: number, price?: number, msrp?: number, saleStartDate?: string | null, saleEndDate?: string | null }[]'
)
content = content.replace(
  'centralProducts: { id: string, sku: string, price?: string | null, msrp?: string | null }[]',
  'centralProducts: { id: string, sku: string, price?: string | null, msrp?: string | null, saleStartDate?: Date | null, saleEndDate?: Date | null }[]'
)

// 2. Selects
content = content.replace(/msrp: products\.msrp \}\)/g, 'msrp: products.msrp, saleStartDate: products.saleStartDate, saleEndDate: products.saleEndDate })')

// 3. Mapping logic
const findBlock = '    // Price -> Sales Price (Marketplace reducedPrice)'
const insertBlock = `
    let modifiedSaleStartDate = updateDef.saleStartDate !== undefined ? (updateDef.saleStartDate ? new Date(updateDef.saleStartDate) : null) : centralProduct.saleStartDate
    let modifiedSaleEndDate = updateDef.saleEndDate !== undefined ? (updateDef.saleEndDate ? new Date(updateDef.saleEndDate) : null) : centralProduct.saleEndDate

    if (modifiedSaleStartDate) mUpdate.saleStartDate = modifiedSaleStartDate;
    if (modifiedSaleEndDate) mUpdate.saleEndDate = modifiedSaleEndDate;
`
content = content.replace(findBlock, insertBlock.trim() + '\\n    ' + findBlock.trim())

fs.writeFileSync(file, content)
console.log("Patched sync dates")
