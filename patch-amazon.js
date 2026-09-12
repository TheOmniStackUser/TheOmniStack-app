const fs = require('fs');

let content = fs.readFileSync('src/adapters/marketplace/amazon.ts', 'utf8');

// Insert zlib import if not present
if (!content.includes('import zlib')) {
  content = "import zlib from 'zlib'\n" + content;
}

const oldFetchProducts = /async fetchProducts\(companyId: string\): Promise<import\('\.\/base'\)\.MarketplaceProduct\[\]> \{[\s\S]*?\} catch \(error: any\) \{[\s\S]*?throw error\n    \}\n  \}/;

const newFetchProducts = `async fetchProducts(companyId: string, onProgress?: (progress: number, total: number, message: string) => void): Promise<import('./base').MarketplaceProduct[]> {
    try {
      if (onProgress) onProgress(0, 100, 'Fordere Amazon-Report (GET_MERCHANT_LISTINGS_ALL_DATA) an...')
      const accessToken = await this.getAccessToken()

      // 1. Request the report
      const createReportUrl = \`\${this.baseUrl}/reports/2021-06-30/reports\`
      const createReportRes = await fetch(createReportUrl, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
          marketplaceIds: [this.marketplaceId]
        })
      })

      if (!createReportRes.ok) {
        const err = await createReportRes.text()
        throw new Error(\`Fehler beim Anfordern des Reports: \${err}\`)
      }

      const { reportId } = await createReportRes.json()
      
      // 2. Poll until DONE
      let processingStatus = 'IN_QUEUE'
      let reportDocumentId = ''
      
      while (processingStatus === 'IN_QUEUE' || processingStatus === 'IN_PROGRESS') {
        await new Promise(resolve => setTimeout(resolve, 30000)) // 30s
        if (onProgress) onProgress(50, 100, \`Warte auf Generierung des Reports durch Amazon (Status: \${processingStatus})...\`)

        const pollRes = await fetch(\`\${createReportUrl}/\${reportId}\`, {
          headers: { 'x-amz-access-token': await this.getAccessToken(), 'Accept': 'application/json' }
        })
        const pollData = await pollRes.json()
        
        processingStatus = pollData.processingStatus
        
        if (processingStatus === 'FATAL' || processingStatus === 'CANCELLED') {
          throw new Error(\`Report-Generierung fehlgeschlagen mit Status: \${processingStatus}\`)
        }
        if (processingStatus === 'DONE') {
          reportDocumentId = pollData.reportDocumentId
        }
      }

      if (!reportDocumentId) {
        throw new Error('Keine ReportDocumentId von Amazon erhalten.')
      }

      // 3. Get document URL
      if (onProgress) onProgress(80, 100, 'Lade Report-Dokument von Amazon herunter...')
      const docRes = await fetch(\`\${this.baseUrl}/reports/2021-06-30/documents/\${reportDocumentId}\`, {
        headers: { 'x-amz-access-token': await this.getAccessToken(), 'Accept': 'application/json' }
      })
      const docData = await docRes.json()

      // 4. Download and decompress document
      const fileRes = await fetch(docData.url)
      const buffer = await fileRes.arrayBuffer()
      let text = ''
      
      if (docData.compressionAlgorithm === 'GZIP') {
        text = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8')
      } else {
        text = Buffer.from(buffer).toString('utf-8')
      }

      // 5. Parse TSV
      if (onProgress) onProgress(90, 100, 'Verarbeite Report-Daten...')
      
      const lines = text.split(/\\r?\\n/).filter(l => l.trim())
      if (lines.length < 2) return []

      const headers = lines[0].split('\\t').map(h => h.toLowerCase().trim())
      const skuIdx = headers.findIndex(h => h.includes('sku') && !h.includes('fnsku'))
      const asinIdx = headers.findIndex(h => h === 'asin1' || h === 'asin')
      const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('title'))
      const priceIdx = headers.findIndex(h => h.includes('price'))
      const quantityIdx = headers.findIndex(h => h.includes('quantity'))

      const products = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\\t')
        const sku = cols[skuIdx]?.trim()
        if (!sku) continue

        const asin = asinIdx !== -1 ? cols[asinIdx]?.trim() : sku
        const title = titleIdx !== -1 ? cols[titleIdx]?.trim() : sku
        
        let price = 0
        if (priceIdx !== -1 && cols[priceIdx]) {
          price = parseFloat(cols[priceIdx].trim().replace(',', '.'))
          if (isNaN(price)) price = 0
        }
        
        let stock = null
        if (quantityIdx !== -1 && cols[quantityIdx]) {
          stock = parseInt(cols[quantityIdx].trim(), 10)
          if (isNaN(stock)) stock = null
        }

        products.push({
          marketplaceProductId: asin,
          sku: sku,
          title: title,
          price: price,
          stock: stock,
          rawPayload: { _source: 'reports_api', row: lines[i] }
        })
      }

      if (onProgress) onProgress(100, 100, 'Amazon-Produkte erfolgreich verarbeitet.')
      return products
    } catch (error: any) {
      console.error(\`[AmazonAdapter] Error fetching products via Reports API:\`, error)
      throw error
    }
  }`;

content = content.replace(oldFetchProducts, newFetchProducts);
fs.writeFileSync('src/adapters/marketplace/amazon.ts', content);
console.log("Patched amazon.ts");
