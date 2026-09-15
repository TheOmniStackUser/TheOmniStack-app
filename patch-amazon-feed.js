const fs = require('fs');

let content = fs.readFileSync('src/adapters/marketplace/amazon.ts', 'utf8');

const submitXmlFeedMethod = `
  private async submitXmlFeed(feedType: string, xmlContent: string): Promise<string> {
    const accessToken = await this.getAccessToken()

    // 1. Create Feed Document
    const createDocRes = await fetch(\`\${this.baseUrl}/feeds/2021-06-30/documents\`, {
      method: 'POST',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ contentType: 'text/xml; charset=UTF-8' })
    })

    if (!createDocRes.ok) {
      const err = await createDocRes.text()
      throw new Error(\`Failed to create feed document: \${createDocRes.status} \${err}\`)
    }

    const { feedDocumentId, url } = await createDocRes.json()

    // 2. Upload XML to Document URL
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8'
      },
      body: xmlContent
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(\`Failed to upload XML to feed document: \${uploadRes.status} \${err}\`)
    }

    // 3. Submit Feed
    const submitRes = await fetch(\`\${this.baseUrl}/feeds/2021-06-30/feeds\`, {
      method: 'POST',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        feedType,
        marketplaceIds: [this.marketplaceId],
        inputFeedDocumentId: feedDocumentId
      })
    })

    if (!submitRes.ok) {
      const err = await submitRes.text()
      throw new Error(\`Failed to submit feed \${feedType}: \${submitRes.status} \${err}\`)
    }

    const { feedId } = await submitRes.json()
    console.log(\`[AmazonAdapter] Successfully submitted \${feedType} feed. FeedId: \${feedId}\`)
    return feedId
  }
`;

// Insert it right before updateListings
content = content.replace(/async updateListings\(/, submitXmlFeedMethod + '\n  async updateListings(');

const newUpdateListingsMethod = `async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const inventoryUpdates = updates.filter(u => u.stock !== undefined)
      const priceUpdates = updates.filter(u => u.price !== undefined)

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
        const priceMessages = priceUpdates.map(u => \`
  <Message>
    <MessageID>\${msgId++}</MessageID>
    <OperationType>Update</OperationType>
    <Price>
      <SKU>\${this.escapeXml(u.sku)}</SKU>
      <StandardPrice currency="EUR">\${u.price}</StandardPrice>
    </Price>
  </Message>\`).join('')

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
  }`;

content = content.replace(/async updateListings\([^\{]*\{[\s\S]*?\n  \}\n/m, newUpdateListingsMethod + '\n');

// Also add escapeXml helper
const escapeXmlHelper = `
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\\'': return '&apos;';
        case '"': return '&quot;';
      }
      return c;
    });
  }
`;
content = content.replace(/constructor/, escapeXmlHelper + '\n  constructor');

fs.writeFileSync('src/adapters/marketplace/amazon.ts', content);
console.log("Patched amazon.ts with Feeds API");
