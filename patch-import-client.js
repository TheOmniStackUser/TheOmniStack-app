const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/products/import/import-client.tsx', 'utf8');

// Add import for importAmazonCsvAction
content = content.replace(
  "import { triggerProductImport, getImportSyncStatus } from '@/app/actions/products'",
  "import { triggerProductImport, getImportSyncStatus } from '@/app/actions/products'\nimport { importAmazonCsvAction } from '@/app/actions/amazon-csv'"
);

// Add state for file upload
content = content.replace(
  "const [syncStatus, setSyncStatus] = useState<any>(null)",
  "const [syncStatus, setSyncStatus] = useState<any>(null)\n  const [amazonFile, setAmazonFile] = useState<File | null>(null)\n  const [isUploadingCsv, setIsUploadingCsv] = useState(false)"
);

// Add upload handler
content = content.replace(
  "const handleImport = async () => {",
  `const handleAmazonCsvUpload = async () => {
    if (!amazonFile || !selectedMarketplace) return
    setIsUploadingCsv(true)
    try {
      const formData = new FormData()
      formData.append('file', amazonFile)
      formData.append('integrationId', selectedMarketplace)
      
      const res = await importAmazonCsvAction(formData)
      if (res.error) {
        showNotification('Fehler beim CSV-Import', res.error, 'error')
      } else {
        showNotification('Import erfolgreich', res.message, 'success')
        setAmazonFile(null)
      }
    } catch (e: any) {
      showNotification('Fehler beim Upload', e.message, 'error')
    } finally {
      setIsUploadingCsv(false)
    }
  }

  const handleImport = async () => {`
);

// Modify the return block to show Amazon specific UI
content = content.replace(
  /<\/>\s*\)$/,
  `
      {selectedMarketplace && marketplaces.find(m => m.id === selectedMarketplace)?.type === 'amazon' && (
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-500" />
            Besonderheiten beim Amazon-Produktimport
          </h3>
          <div className="text-sm text-slate-700 space-y-4 leading-relaxed">
            <p>
              Aktuell gibt es <strong>keine einfache Schaltfläche</strong> in OmniStack, um alle Amazon-Produkte auf einmal zu importieren. Das ist ein technisches Problem bei Amazon (die Catalog API liefert für diesen Use-Case keine sinnvolle Antwort).
            </p>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-semibold text-slate-900 mb-1">Option 1: Warten bis die erste Bestellung kommt (Automatisch)</h4>
              <p>Das ist der aktuelle Standard-Weg. Sobald eine Amazon-Bestellung eingeht, werden die bestellten Artikel automatisch als Produkte angelegt. Das Produktverzeichnis füllt sich so von selbst.</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-semibold text-slate-900 mb-2">Option 2: Manueller CSV-Upload (Schnellste Lösung für alle Produkte)</h4>
              <p className="mb-3">
                1. In <strong>Amazon Seller Central</strong> einloggen → Lagerbestand → Lagerbestand verwalten<br/>
                2. Oben rechts auf <strong>„Exportieren"</strong> klicken → CSV-Datei herunterladen<br/>
                3. Diese Datei enthält alle SKUs, Titel, Preise und Bestände und kann hier hochgeladen werden:
              </p>
              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  accept=".csv,.txt,.tsv" 
                  onChange={e => setAmazonFile(e.target.files?.[0] || null)}
                  className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <button 
                  onClick={handleAmazonCsvUpload}
                  disabled={!amazonFile || isUploadingCsv}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isUploadingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                  CSV Hochladen
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <h4 className="font-semibold text-slate-900 mb-1">Option 3: Amazon Reports API (Vollständiger Sync)</h4>
              <p>
                Sie können auch den Button <strong>"Import starten"</strong> oben nutzen. Dies fordert bei Amazon einen "Merchant Listings Report" an. Da Amazon diesen Report erst generieren muss, kann es <strong>Minuten bis Stunden</strong> dauern, bis die Produkte im Hintergrund importiert werden.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )`
);

fs.writeFileSync('src/app/(dashboard)/products/import/import-client.tsx', content);
console.log("Patched import-client.tsx");
