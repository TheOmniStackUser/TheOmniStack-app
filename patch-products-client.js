const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/app/(dashboard)/products/products-client.tsx')
let content = fs.readFileSync(file, 'utf8')

// 1. Bulk states
content = content.replace('const [bulkPrice, setBulkPrice] = useState(\'\')', 'const [bulkPrice, setBulkPrice] = useState(\'\')\n  const [bulkReducedPrice, setBulkReducedPrice] = useState(\'\')')

// 2. handleBulkEditSubmit
content = content.replace('let newPrice: number | undefined', 'let newPrice: number | undefined\n      let newReducedPrice: number | undefined')
content = content.replace(/if \(bulkPrice\.trim\(\) !== ''\) {[\s\S]*?if \(!isNaN\(parsed\)\) newPrice = Math\.max\(0, parsed\)\n      }/, `
      if (bulkPrice.trim() !== '') {
        const parsed = parseFloat(bulkPrice.replace(',', '.'))
        if (!isNaN(parsed)) newPrice = Math.max(0, parsed)
      }
      if (bulkReducedPrice.trim() !== '') {
        const parsed = parseFloat(bulkReducedPrice.replace(',', '.'))
        if (!isNaN(parsed)) newReducedPrice = Math.max(0, parsed)
      }
`.trim())

content = content.replace('if (newStock === undefined && newPrice === undefined) {', 'if (newStock === undefined && newPrice === undefined && newReducedPrice === undefined) {')
content = content.replace('await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice)', 'await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice, newReducedPrice)')
content = content.replace('setBulkPrice(\'\')', 'setBulkPrice(\'\')\n      setBulkReducedPrice(\'\')')

// 3. Table Headers
content = content.replace('PREIS\\n                        (BRUTTO)', 'NORMALER PREIS\\n                        (BRUTTO)')
const thPrice = `<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">\n                        NORMALER PREIS\n                        (BRUTTO)\n                      </th>`
const thReducedPrice = `<th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">\n                        AKTIONS-PREIS\n                        (BRUTTO)\n                      </th>`
content = content.replace(thPrice, thPrice + '\n                      ' + thReducedPrice)

// 4. Table Cells - find the price cell.
const tdPriceOld = `
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingPrice[product.id] ?? (product.price ? parseFloat(product.price).toFixed(2).replace('.', ',') : '')}
                            onChange={(e) => {
                              const val = e.target.value
                              if (/^\\d*,?\\d{0,2}$/.test(val)) {
                                setEditingPrice(prev => ({ ...prev, [product.id]: val }))
                              }
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const val = editingPrice[product.id]
                                if (val) {
                                  await handleInlinePriceUpdate(product.id, val)
                                }
                              }
                            }}
                            onBlur={async () => {
                              const val = editingPrice[product.id]
                              if (val) {
                                await handleInlinePriceUpdate(product.id, val)
                              }
                            }}
                            disabled={isUpdatingPrice === product.id}
                            className="w-24 px-2 py-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50"
                          />
                          <span className="text-sm font-semibold text-slate-700">€</span>
                          {isUpdatingPrice === product.id && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                        </div>
                      </td>
`

// Wait, I need to create a new state for editingReducedPrice and function handleInlineReducedPriceUpdate.
const editingStates = `
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({})
  const [isUpdatingPrice, setIsUpdatingPrice] = useState<string | null>(null)
  
  const [editingReducedPrice, setEditingReducedPrice] = useState<Record<string, string>>({})
  const [isUpdatingReducedPrice, setIsUpdatingReducedPrice] = useState<string | null>(null)
  
  const handleInlineReducedPriceUpdate = async (productId: string, newValue: string) => {
    try {
      setIsUpdatingReducedPrice(productId)
      const parsed = parseFloat(newValue.replace(',', '.'))
      if (!isNaN(parsed)) {
        const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
        await bulkUpdateStockAndPrice([productId], undefined, undefined, parsed)
        showToast('Aktions-Preis gespeichert', 'success')
        setEditingReducedPrice(prev => {
          const next = { ...prev }
          delete next[productId]
          return next
        })
        router.refresh()
      }
    } catch (e) {
      showToast('Fehler beim Speichern', 'error')
    } finally {
      setIsUpdatingReducedPrice(null)
    }
  }
`

if (content.includes('const [editingPrice, setEditingPrice] = useState<Record<string, string>>({})')) {
  content = content.replace(/const \[editingPrice, setEditingPrice\] = useState<Record<string, string>>\(\{\}\)[\s\S]*?const \[isUpdatingPrice, setIsUpdatingPrice\] = useState<string \| null>\(null\)/, editingStates.trim())
}

const tdReducedPriceNew = `
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingReducedPrice[product.id] ?? (product.reducedPrice ? parseFloat(product.reducedPrice).toFixed(2).replace('.', ',') : '')}
                            onChange={(e) => {
                              const val = e.target.value
                              if (/^\\d*,?\\d{0,2}$/.test(val) || val === '') {
                                setEditingReducedPrice(prev => ({ ...prev, [product.id]: val }))
                              }
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const val = editingReducedPrice[product.id]
                                if (val !== undefined) {
                                  await handleInlineReducedPriceUpdate(product.id, val || '0')
                                }
                              }
                            }}
                            onBlur={async () => {
                              const val = editingReducedPrice[product.id]
                              if (val !== undefined) {
                                await handleInlineReducedPriceUpdate(product.id, val || '0')
                              }
                            }}
                            disabled={isUpdatingReducedPrice === product.id}
                            className="w-24 px-2 py-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 placeholder:text-slate-400"
                            placeholder="Kein Aktion"
                          />
                          <span className="text-sm font-semibold text-slate-700">€</span>
                          {isUpdatingReducedPrice === product.id && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                        </div>
                      </td>
`

if (content.includes('className="w-24 px-2 py-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50"')) {
  // It's in the file, let's locate the tdPrice and append tdReducedPriceNew
  const searchRegex = /<td className="px-6 py-4">[\s\S]*?editingPrice\[product\.id\][\s\S]*?<\/td>/;
  const match = content.match(searchRegex)
  if (match) {
    content = content.replace(match[0], match[0] + '\n' + tdReducedPriceNew)
  } else {
    console.log("Could not match tdPrice")
  }
}

// 5. Update Bulk Modal
const bulkModalInput = `
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Aktions-Preis (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkReducedPrice} 
                    onChange={e => setBulkReducedPrice(e.target.value)} 
                    placeholder="z.B. 14.90 (0 zum Löschen)" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
`
content = content.replace('</div>\n              </div>\n            </div>\n            \n            <div className="p-4 sm:p-6 bg-slate-50 flex', bulkModalInput + '\n              </div>\n            </div>\n            \n            <div className="p-4 sm:p-6 bg-slate-50 flex')

fs.writeFileSync(file, content)
console.log("Patched products-client.tsx")
