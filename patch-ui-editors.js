const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// Fix PriceEditor to use msrp -> MsrpEditor
content = content.replace(/function PriceEditor/g, 'function MsrpEditor')

// We need a NEW PriceEditor that edits product.price
const priceEditorStr = `
function PriceEditor({ product }: { product: Product }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.price ? Number(product.price).toFixed(2) : '0.00')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    let numericValue = Number(value.replace(',', '.'))
    if (numericValue < 0) { numericValue = 0; setValue('0.00') }
    if (String(numericValue) === product.price || isNaN(numericValue)) {
      setIsEditing(false); setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); return
    }
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      await bulkUpdateStockAndPrice([product.id], undefined, numericValue)
      setIsEditing(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Fehler beim Speichern des Preises")
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
    } finally { setIsSaving(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); setIsEditing(false) }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Standard Preis bearbeiten"
      >
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed">{Number(product.price || 0).toFixed(2)} €</span>
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input autoFocus type="number" step="0.01" min="0" value={value} onChange={e => setValue(e.target.value)} onKeyDown={handleKeyDown} disabled={isSaving} className="w-24 px-2 py-1 text-sm border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 bg-white" />
      <button onClick={handleSave} disabled={isSaving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button onClick={() => { setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); setIsEditing(false); }} disabled={isSaving} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}
`

content = content.replace('function MsrpEditor({ product }: { product: Product }) {', priceEditorStr + '\n\nfunction MsrpEditor({ product }: { product: Product }) {')

// Fix ReducedPriceEditor
content = content.replace(/value={value}\n\s+onChange={e => setValue\(e.target.value\)}/g, "value={value} onChange={e => setValue(e.target.value)}")
content = content.replace(/const \[value, setValue\] = useState\(product\.price \? Number\(product\.price\)\.toFixed\(2\) : ''\)/g, "const [value, setValue] = useState(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')")
content = content.replace(/String\(numericValue\) === product\.price/g, "String(numericValue) === product.reducedPrice")
content = content.replace(/setValue\(product\.price \? Number\(product\.price\)\.toFixed\(2\) : ''\)/g, "setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')")
content = content.replace(/product\.price \? Number\(product\.price\)\.toFixed\(2\) \+ ' €' : '-'/g, "product.reducedPrice ? Number(product.reducedPrice).toFixed(2) + ' €' : '-'")
content = content.replace(/await bulkUpdateStockAndPrice\(\[product\.id\], undefined, numericValue\)/g, "await bulkUpdateStockAndPrice([product.id], undefined, undefined, numericValue)")

// Add UVP to the table headers
content = content.replace(/<Th column="price">Normaler Preis<\/Th>/, '<Th column="msrp">UVP</Th>\n              <Th column="price">Standard Preis</Th>')
content = content.replace(/<Th column="reducedPrice">Aktions-Preis<\/Th>/, '<Th column="reducedPrice">Reduzierter Preis</Th>')

// Add UVP to the table rows
content = content.replace(/<MsrpEditor product={product} \/>/, '<MsrpEditor product={product} />\n                      </td>\n                      <td className="px-6 py-4">\n                        <PriceEditor product={product} />')

// Also fix colSpan for empty state and expanded state from 8 to 9
content = content.replace(/colSpan={8}/g, 'colSpan={9}')

fs.writeFileSync(file, content)
