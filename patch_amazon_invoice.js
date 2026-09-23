const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/adapters/marketplace/amazon.ts')
let content = fs.readFileSync(file, 'utf8')

const invoiceMethod = `
  async uploadInvoice(
    marketplaceOrderId: string,
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<boolean> {
    try {
      console.log(\`[AmazonAdapter] Uploading invoice for \${marketplaceOrderId}...\`)
      const accessToken = await this.getAccessToken()

      // 1. Fetch Order Totals for feedOptions
      // Get order details
      const rdtToken = await this.getRestrictedDataToken(accessToken, 'GET', \`/orders/v0/orders/\${marketplaceOrderId}\`, ['buyerInfo', 'shippingAddress'])
      const orderRes = await fetch(\`\${this.baseUrl}/orders/v0/orders/\${marketplaceOrderId}\`, {
        headers: { 'x-amz-access-token': rdtToken }
      })
      if (!orderRes.ok) {
        throw new Error(\`Failed to fetch order details: \${orderRes.status}\`)
      }
      const orderData = await orderRes.json()
      
      const itemsRes = await fetch(\`\${this.baseUrl}/orders/v0/orders/\${marketplaceOrderId}/orderItems\`, {
        headers: { 'x-amz-access-token': accessToken } // Items don't need RDT unless buyer info is requested
      })
      if (!itemsRes.ok) {
        throw new Error(\`Failed to fetch order items: \${itemsRes.status}\`)
      }
      const itemsData = await itemsRes.json()

      const totalAmount = parseFloat(orderData.payload.OrderTotal?.Amount || '0')
      
      let totalVatAmount = 0
      const items = itemsData.payload?.OrderItems || []
      for (const item of items) {
        if (item.ItemTax && item.ItemTax.Amount) {
          totalVatAmount += parseFloat(item.ItemTax.Amount)
        }
        if (item.ShippingTax && item.ShippingTax.Amount) {
          totalVatAmount += parseFloat(item.ShippingTax.Amount)
        }
        if (item.GiftWrapTax && item.GiftWrapTax.Amount) {
          totalVatAmount += parseFloat(item.GiftWrapTax.Amount)
        }
      }

      // 2. Create Feed Document
      console.log(\`[AmazonAdapter] Creating feed document for UPLOAD_VAT_INVOICE...\`)
      const createDocRes = await fetch(\`\${this.baseUrl}/feeds/2021-06-30/documents\`, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ contentType: 'application/pdf' })
      })

      if (!createDocRes.ok) {
        const err = await createDocRes.text()
        throw new Error(\`Failed to create feed document: \${createDocRes.status} \${err}\`)
      }

      const { feedDocumentId, url } = await createDocRes.json()

      // 3. Upload PDF to Document URL
      console.log(\`[AmazonAdapter] Uploading PDF to document URL...\`)
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf'
        },
        body: pdfBuffer
      })

      if (!uploadRes.ok) {
        throw new Error(\`Failed to upload PDF: \${uploadRes.status} \${uploadRes.statusText}\`)
      }

      // 4. Create Feed
      const invoiceNumber = fileName.replace('.pdf', '')
      console.log(\`[AmazonAdapter] Creating UPLOAD_VAT_INVOICE feed (Invoice: \${invoiceNumber})...\`)
      
      const createFeedRes = await fetch(\`\${this.baseUrl}/feeds/2021-06-30/feeds\`, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          feedType: 'UPLOAD_VAT_INVOICE',
          marketplaceIds: [this.marketplaceId],
          inputFeedDocumentId: feedDocumentId,
          feedOptions: {
            "metadata:OrderId": marketplaceOrderId,
            "metadata:InvoiceNumber": invoiceNumber,
            "metadata:DocumentType": "Invoice",
            "metadata:TotalAmount": totalAmount.toFixed(2),
            "metadata:TotalVATAmount": totalVatAmount.toFixed(2)
          }
        })
      })

      if (!createFeedRes.ok) {
        const err = await createFeedRes.text()
        throw new Error(\`Failed to create feed: \${createFeedRes.status} \${err}\`)
      }

      const feedData = await createFeedRes.json()
      console.log(\`[AmazonAdapter] Feed created successfully. Feed ID: \${feedData.feedId}\`)
      return true
    } catch (error) {
      console.error(\`[AmazonAdapter] Error uploading invoice:\`, error)
      return false
    }
  }
`

if (!content.includes('uploadInvoice(')) {
  content = content.replace('private async submitXmlFeed', invoiceMethod + '\n  private async submitXmlFeed')
  fs.writeFileSync(file, content)
  console.log("Added uploadInvoice to amazon.ts")
} else {
  console.log("uploadInvoice already exists")
}
