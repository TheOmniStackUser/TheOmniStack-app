const fs = require('fs')

const file = 'src/app/(dashboard)/products/[id]/page.tsx'
let content = fs.readFileSync(file, 'utf8')

// We need to inject reducedPrice, saleStartDate, saleEndDate fields in the form.
const replacementStr = `
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Aktionspreis (€)</label>
                <input type="number" name="reducedPrice" step="0.01" defaultValue={product.reducedPrice ? Number(product.reducedPrice) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Aktion Startdatum</label>
                <input type="datetime-local" name="saleStartDate" defaultValue={product.saleStartDate ? new Date(product.saleStartDate.getTime() - product.saleStartDate.getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Aktion Enddatum</label>
                <input type="datetime-local" name="saleEndDate" defaultValue={product.saleEndDate ? new Date(product.saleEndDate.getTime() - product.saleEndDate.getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
`

// Inject fields after Einkaufspreis
content = content.replace(
  /<div className="space-y-2">\s*<label className="text-sm font-semibold text-slate-700">Einkaufspreis \(€\)<\/label>[\s\S]*?<\/div>/,
  '$&\n' + replacementStr
)

// We also need to update the server action `updateProduct` at the top of the file.
const serverActionReplace = `
    const priceStr = formData.get('price')?.toString()
    const msrpStr = formData.get('msrp')?.toString()
    const reducedPriceStr = formData.get('reducedPrice')?.toString()
    const purchasePriceStr = formData.get('purchasePrice')?.toString()
    const saleStartDateStr = formData.get('saleStartDate')?.toString()
    const saleEndDateStr = formData.get('saleEndDate')?.toString()

    await db.update(centralProducts)
      .set({
        title: formData.get('title')?.toString(),
        brand: formData.get('brand')?.toString(),
        category: formData.get('category')?.toString(),
        ean: formData.get('ean')?.toString(),
        description: formData.get('description')?.toString(),
        price: priceStr ? priceStr.replace(',', '.') : null,
        msrp: msrpStr ? msrpStr.replace(',', '.') : null,
        reducedPrice: reducedPriceStr ? reducedPriceStr.replace(',', '.') : null,
        purchasePrice: purchasePriceStr ? purchasePriceStr.replace(',', '.') : null,
        saleStartDate: saleStartDateStr ? new Date(saleStartDateStr) : null,
        saleEndDate: saleEndDateStr ? new Date(saleEndDateStr) : null,
        currentStock: Number(formData.get('currentStock')) || 0,
        updatedAt: new Date(),
      })
`

content = content.replace(
  /const priceStr = formData\.get\('price'\)\?\.toString\(\)[\s\S]*?updatedAt: new Date\(\),\s*}\)/,
  serverActionReplace
)

fs.writeFileSync(file, content)
