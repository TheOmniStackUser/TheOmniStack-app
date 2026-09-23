const fs = require('fs')
const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

const newComponent = `
function ReducedPriceDatesEditor({ product }: { product: Product }) {
  const [isEditing, setIsEditing] = useState(false)
  
  const formatDateForInput = (date: any) => {
    if (!date) return ''
    try {
      return new Date(date).toISOString().split('T')[0]
    } catch {
      return ''
    }
  }
  
  const [startValue, setStartValue] = useState(formatDateForInput(product.saleStartDate))
  const [endValue, setEndValue] = useState(formatDateForInput(product.saleEndDate))
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      const sDate = startValue ? new Date(startValue) : null
      const eDate = endValue ? new Date(endValue) : null
      await bulkUpdateStockAndPrice([product.id], undefined, undefined, undefined, undefined, sDate, eDate)
      setIsEditing(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Fehler beim Speichern der Aktionsdaten")
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setStartValue(formatDateForInput(product.saleStartDate))
      setEndValue(formatDateForInput(product.saleEndDate))
      setIsEditing(false)
    }
  }

  const displayString = () => {
    if (!product.saleStartDate && !product.saleEndDate) return '-'
    const s = product.saleStartDate ? new Date(product.saleStartDate).toLocaleDateString('de-DE') : 'Unbegrenzt'
    const e = product.saleEndDate ? new Date(product.saleEndDate).toLocaleDateString('de-DE') : 'Unbegrenzt'
    return \`\${s} - \${e}\`
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Aktionszeitraum bearbeiten"
      >
        <span className="text-xs font-medium text-slate-500 border-b border-slate-300 border-dashed">{displayString()}</span>
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 bg-white p-2 rounded-lg border border-slate-200 shadow-sm" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase w-8">Von</label>
        <input
          autoFocus
          type="date"
          value={startValue}
          onChange={e => setStartValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-28 px-2 py-1 text-xs border border-slate-300 focus:border-cyan-500 outline-none rounded text-slate-700 bg-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase w-8">Bis</label>
        <input
          type="date"
          value={endValue}
          onChange={e => setEndValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-28 px-2 py-1 text-xs border border-slate-300 focus:border-cyan-500 outline-none rounded text-slate-700 bg-white"
        />
      </div>
      <div className="flex justify-end gap-1 mt-1">
        <button onClick={() => { setStartValue(''); setEndValue(''); setIsEditing(false); }} className="px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 text-xs">Abbrechen</button>
        <button onClick={handleSave} className="px-2 py-1 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200 text-xs font-semibold">Speichern</button>
      </div>
    </div>
  )
}
`

content = content.replace('export function ProductsClient', newComponent + '\\nexport function ProductsClient')

// Headers
content = content.replace(
  '<Th column="reducedPrice">Aktions-Preis</Th>',
  '<Th column="reducedPrice">Aktions-Preis</Th>\\n              <Th column="saleStartDate">Aktionszeitraum</Th>'
)

// Cells
content = content.replace(
  /<td className="px-6 py-4">\s*<ReducedPriceEditor product=\{product\} \/>\s*<\/td>/,
  '<td className="px-6 py-4">\\n                        <ReducedPriceEditor product={product} />\\n                      </td>\\n                      <td className="px-6 py-4">\\n                        <ReducedPriceDatesEditor product={product} />\\n                      </td>'
)

fs.writeFileSync(file, content)
