const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// 1. Add bulkMsrp state
content = content.replace(
  /const \[bulkPrice, setBulkPrice\] = useState\(''\)/,
  "const [bulkMsrp, setBulkMsrp] = useState('')\n  const [bulkPrice, setBulkPrice] = useState('')"
)

// 2. Parse bulkMsrp and fix args
const oldSaveLogic = `      if (bulkPrice.trim() !== '') {
        const parsed = parseFloat(bulkPrice.replace(',', '.'))
        if (!isNaN(parsed)) newPrice = Math.max(0, parsed)
      }
      if (bulkReducedPrice.trim() !== '') {
        const parsed = parseFloat(bulkReducedPrice.replace(',', '.'))
        if (!isNaN(parsed)) newReducedPrice = Math.max(0, parsed)
      }

      if (newStock === undefined && newPrice === undefined && newReducedPrice === undefined && newSaleStartDate === undefined && newSaleEndDate === undefined) {
        showToast('Keine Änderungen eingegeben', 'info')
        setIsBulkEditing(false)
        return
      }

      // newPrice comes from bulkPrice (which is "Normaler Preis" / UVP -> newMsrp)
      // newReducedPrice comes from bulkReducedPrice (which is "Aktions-Preis" -> newPrice)
      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newReducedPrice, undefined, newPrice, newSaleStartDate, newSaleEndDate)`

const newSaveLogic = `      let parsedMsrp = undefined;
      if (bulkMsrp.trim() !== '') {
        const parsed = parseFloat(bulkMsrp.replace(',', '.'))
        if (!isNaN(parsed)) parsedMsrp = Math.max(0, parsed)
      }
      if (bulkPrice.trim() !== '') {
        const parsed = parseFloat(bulkPrice.replace(',', '.'))
        if (!isNaN(parsed)) newPrice = Math.max(0, parsed)
      }
      if (bulkReducedPrice.trim() !== '') {
        const parsed = parseFloat(bulkReducedPrice.replace(',', '.'))
        if (!isNaN(parsed)) newReducedPrice = Math.max(0, parsed)
      }

      if (newStock === undefined && parsedMsrp === undefined && newPrice === undefined && newReducedPrice === undefined && newSaleStartDate === undefined && newSaleEndDate === undefined) {
        showToast('Keine Änderungen eingegeben', 'info')
        setIsBulkEditing(false)
        return
      }

      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice, newReducedPrice, parsedMsrp, newSaleStartDate, newSaleEndDate)`

content = content.replace(oldSaveLogic, newSaveLogic)

// 3. Clear bulkMsrp on save
content = content.replace(
  /setBulkPrice\(''\)/,
  "setBulkMsrp('')\n      setBulkPrice('')"
)

// 4. Update Modal UI
const oldModalUI = `<div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Preis (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkPrice} 
                    onChange={e => setBulkPrice(e.target.value)} 
                    placeholder="z.B. 19.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>`

const newModalUI = `<div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neue UVP (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkMsrp} 
                    onChange={e => setBulkMsrp(e.target.value)} 
                    placeholder="z.B. 24.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Standard-Preis (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkPrice} 
                    onChange={e => setBulkPrice(e.target.value)} 
                    placeholder="z.B. 19.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>`

content = content.replace(oldModalUI, newModalUI)

fs.writeFileSync(file, content)
