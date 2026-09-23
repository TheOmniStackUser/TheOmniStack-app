const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// 1. Add ReducedPriceEditor
const reducedPriceEditorCode = `
function ReducedPriceEditor({ product }: { product: Product }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    let numericValue = value.trim() === '' ? 0 : Number(value.replace(',', '.'))
    
    if (numericValue < 0) {
      numericValue = 0
      setValue('')
    }

    if (String(numericValue) === product.reducedPrice || isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
      return
    }
    
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      await bulkUpdateStockAndPrice([product.id], undefined, undefined, numericValue)
      setIsEditing(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Fehler beim Speichern des Aktionspreises")
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Aktionspreis bearbeiten"
      >
        <span className="font-semibold text-rose-600 border-b border-rose-200 border-dashed">{product.reducedPrice ? Number(product.reducedPrice).toFixed(2) + ' €' : '-'}</span>
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
      <input
        autoFocus
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder="0.00"
        className="w-24 px-2 py-1 text-sm border border-rose-400 focus:ring-2 focus:ring-rose-500/50 outline-none rounded font-semibold text-rose-600 bg-white"
      />
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50 flex items-center justify-center"
        title="Speichern"
      >
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        )}
      </button>
      <button
        onClick={() => { setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : ''); setIsEditing(false); }}
        disabled={isSaving}
        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
`

if (!content.includes('function ReducedPriceEditor')) {
  content = content.replace('export function ProductsClient', reducedPriceEditorCode + '\nexport function ProductsClient')
}

// 2. Add header
content = content.replace('<Th column="price">Preis (Brutto)</Th>', '<Th column="price">Normaler Preis</Th>\n              <Th column="reducedPrice">Aktions-Preis</Th>')

// 3. Add column
content = content.replace(/<td className="px-6 py-4">\s*<PriceEditor product={product} \/>\s*<\/td>/, '<td className="px-6 py-4">\n                        <PriceEditor product={product} />\n                      </td>\n                      <td className="px-6 py-4">\n                        <ReducedPriceEditor product={product} />\n                      </td>')

fs.writeFileSync(file, content)
console.log("Patched products-client.tsx")
