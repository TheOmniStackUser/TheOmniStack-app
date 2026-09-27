const fs = require('fs');
let ottoTs = fs.readFileSync('src/adapters/marketplace/otto.ts', 'utf8');

const oldPriceUpdatesCode = `      const priceUpdates = updates.filter(u => u.price !== undefined || u.reducedPrice !== undefined).map(u => {
        const payload: any = {
          sku: u.sku,
          standardPrice: {
            amount: u.price !== undefined ? u.price : u.fallbackPrice,
            currency: 'EUR'
          }
        }
        if (u.reducedPrice) {
          payload.sale = {
            salePrice: {
              amount: u.reducedPrice,
              currency: 'EUR'
            },
            startDate: u.saleStartDate ? u.saleStartDate.toISOString() : new Date().toISOString(),
            endDate: u.saleEndDate ? u.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
        return payload
      })`;

const newPriceUpdatesCode = `      const priceUpdates = updates.filter(u => u.price !== undefined || u.reducedPrice !== undefined).map(u => {
        const payload: any = {
          sku: u.sku,
          standardPrice: {
            amount: u.price !== undefined ? u.price : u.fallbackPrice,
            currency: 'EUR'
          }
        }
        if (u.reducedPrice && u.reducedPrice > 0) {
          payload.sale = {
            salePrice: {
              amount: u.reducedPrice,
              currency: 'EUR'
            },
            startDate: u.saleStartDate ? u.saleStartDate.toISOString() : new Date().toISOString(),
            endDate: u.saleEndDate ? u.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
        return payload
      })`;

ottoTs = ottoTs.replace(oldPriceUpdatesCode, newPriceUpdatesCode);

const oldFetchCode = `          console.log(\`[OttoAdapter] Updating \${chunk.length} prices via POST /v3/products...\`)
          const pRes = await fetch(\`\${this.baseUrl}/v3/products\`, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${accessToken}\`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(chunk)
          })`;

const newFetchCode = `          console.log(\`[OttoAdapter] Updating \${chunk.length} prices via POST /v5/products/prices...\`)
          const pRes = await fetch(\`\${this.baseUrl}/v5/products/prices\`, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${accessToken}\`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Request-Timestamp': new Date().toISOString()
            },
            body: JSON.stringify({ variationPrices: chunk })
          })`;

ottoTs = ottoTs.replace(oldFetchCode, newFetchCode);

fs.writeFileSync('src/adapters/marketplace/otto.ts', ottoTs);
