const fs = require('fs')
const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

content = content.replace(
  'const [bulkReducedPrice, setBulkReducedPrice] = useState(\'\')',
  'const [bulkReducedPrice, setBulkReducedPrice] = useState(\'\')\\n  const [bulkSaleStartDate, setBulkSaleStartDate] = useState(\'\')\\n  const [bulkSaleEndDate, setBulkSaleEndDate] = useState(\'\')'
)

content = content.replace(
  'const newStock = bulkStock.trim() !== \'\' ? Math.max(0, parseInt(bulkStock)) : undefined',
  'const newSaleStartDate = bulkSaleStartDate ? new Date(bulkSaleStartDate) : undefined\\n      const newSaleEndDate = bulkSaleEndDate ? new Date(bulkSaleEndDate) : undefined\\n      const newStock = bulkStock.trim() !== \'\' ? Math.max(0, parseInt(bulkStock)) : undefined'
)

content = content.replace(
  'if (newStock === undefined && newPrice === undefined && newReducedPrice === undefined) {',
  'if (newStock === undefined && newPrice === undefined && newReducedPrice === undefined && newSaleStartDate === undefined && newSaleEndDate === undefined) {'
)

content = content.replace(
  'await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newReducedPrice, undefined, newPrice)',
  'await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newReducedPrice, undefined, newPrice, newSaleStartDate, newSaleEndDate)'
)

const bulkInputs = `
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Aktion Start (Von)</label>
                    <input 
                      type="date" 
                      value={bulkSaleStartDate} 
                      onChange={e => setBulkSaleStartDate(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Aktion Ende (Bis)</label>
                    <input 
                      type="date" 
                      value={bulkSaleEndDate} 
                      onChange={e => setBulkSaleEndDate(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900" 
                    />
                  </div>
                </div>
`

content = content.replace(
  '<label className="text-sm font-semibold text-slate-700">Neuer Aktions-Preis (Brutto in €)</label>',
  bulkInputs.trim() + '\\n\\n                <label className="text-sm font-semibold text-slate-700">Neuer Aktions-Preis (Brutto in €)</label>'
)

fs.writeFileSync(file, content)
