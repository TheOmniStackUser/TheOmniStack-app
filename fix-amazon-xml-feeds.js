const fs = require('fs');

let amazonTs = fs.readFileSync('src/adapters/marketplace/amazon.ts', 'utf8');

// I will completely replace the `updateListings` method.
// First, find the start and end of updateListings.

const updateListingsRegex = /async updateListings\([\s\S]*?\}\n  \}\n/m;

const newUpdateListings = `async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number; reducedPrice?: number; fallbackPrice?: number; saleStartDate?: Date | null; saleEndDate?: Date | null; }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const inventoryUpdates = updates.filter(u => u.stock !== undefined)
      const priceUpdates = updates.filter(u => u.price !== undefined || u.reducedPrice !== undefined)

      if (inventoryUpdates.length > 0) {
        let msgId = 1
        const inventoryMessages = inventoryUpdates.map(u => \`
  <Message>
    <MessageID>\${msgId++}</MessageID>
    <OperationType>Update</OperationType>
    <Inventory>
      <SKU>\${this.escapeXml(u.sku)}</SKU>
      <Quantity>\${u.stock}</Quantity>
    </Inventory>
  </Message>\`).join('')

        const inventoryXml = \`<?xml version="1.0" encoding="utf-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>\${this.config.sellerId}</MerchantIdentifier>
  </Header>
  <MessageType>Inventory</MessageType>
  \${inventoryMessages}
</AmazonEnvelope>\`

        await this.submitXmlFeed('POST_INVENTORY_AVAILABILITY_DATA', inventoryXml)
      }

      if (priceUpdates.length > 0) {
        let msgId = 1
        const priceMessages = priceUpdates.map(u => {
          const standardPrice = u.price !== undefined ? u.price : (u.fallbackPrice || 0)
          let saleBlock = ''
          if (u.reducedPrice !== undefined && u.reducedPrice > 0) {
            const startStr = (u.saleStartDate ? u.saleStartDate : new Date()).toISOString()
            const endStr = (u.saleEndDate ? u.saleEndDate : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)).toISOString()
            saleBlock = \`
      <Sale>
        <StartDate>\${startStr}</StartDate>
        <EndDate>\${endStr}</EndDate>
        <SalePrice currency="EUR">\${u.reducedPrice}</SalePrice>
      </Sale>\`
          }

          return \`
  <Message>
    <MessageID>\${msgId++}</MessageID>
    <OperationType>Update</OperationType>
    <Price>
      <SKU>\${this.escapeXml(u.sku)}</SKU>
      <StandardPrice currency="EUR">\${standardPrice}</StandardPrice>\${saleBlock}
    </Price>
  </Message>\`
        }).join('')

        const priceXml = \`<?xml version="1.0" encoding="utf-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>\${this.config.sellerId}</MerchantIdentifier>
  </Header>
  <MessageType>Price</MessageType>
  \${priceMessages}
</AmazonEnvelope>\`

        await this.submitXmlFeed('POST_PRODUCT_PRICING_DATA', priceXml)
      }

    } catch (error) {
      console.error(\`[AmazonAdapter] Error updating listings:\`, error)
      throw error
    }
  }
`;

amazonTs = amazonTs.replace(updateListingsRegex, newUpdateListings);
fs.writeFileSync('src/adapters/marketplace/amazon.ts', amazonTs);
