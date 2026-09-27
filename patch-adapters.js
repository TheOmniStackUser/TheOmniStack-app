const fs = require('fs')

for (const name of ['amazon.ts', 'otto.ts', 'mirakl.ts']) {
  const file = 'src/adapters/marketplace/' + name
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8')
    content = content.replace(
      /updates: \{ sku: string; marketplaceProductId\?: string; stock\?: number; price\?: number; reducedPrice\?: number; fallbackPrice\?: number; saleStartDate\?: Date \| null; saleEndDate\?: Date \| null; \}\[\]/,
      'updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number; reducedPrice?: number; msrp?: number; fallbackPrice?: number; saleStartDate?: Date | null; saleEndDate?: Date | null; }[]'
    )
    
    if (name === 'otto.ts') {
      // Fix how otto.ts uses msrp vs price
      // In otto.ts: 
      // const standardAmount = u.price !== undefined ? u.price : u.fallbackPrice
      // This is now perfectly correct! u.price IS the standard price.
      // But we need to use u.msrp for the MSRP, and u.reducedPrice for salePrice.
      
      content = content.replace(
        /msrp: \{\s*amount: standardAmount,\s*currency: 'EUR'\s*\}/,
        "msrp: (u.msrp !== undefined) ? { amount: u.msrp, currency: 'EUR' } : undefined"
      )
      
      // And in the workaround loop:
      // const uvpUpdates = updates.filter(u => u.price !== undefined); -> const uvpUpdates = updates.filter(u => u.msrp !== undefined);
      content = content.replace(
        /const uvpUpdates = updates\.filter\(u => u\.price !== undefined\);/,
        'const uvpUpdates = updates.filter(u => u.msrp !== undefined);'
      )
      
      // if (currentMsrp === u.price) return; -> if (currentMsrp === u.msrp) return;
      content = content.replace(
        /if \(currentMsrp === u\.price\) return;/,
        'if (currentMsrp === u.msrp) return;'
      )
      
      // product.pricing.msrp = { amount: u.price, currency: 'EUR' }; -> amount: u.msrp
      content = content.replace(
        /product\.pricing\.msrp = \{ amount: u\.price, currency: 'EUR' \};/,
        "product.pricing.msrp = { amount: u.msrp, currency: 'EUR' };"
      )
      
      // console.log(\`... \({currentMsrp} -> \${u.price}\)\`); -> {u.msrp}
      content = content.replace(
        /-> \$\{u\.price\}\)`\);/,
        "-> ${u.msrp}`);"
      )
    }

    if (name === 'amazon.ts') {
      // In amazon.ts:
      // if (u.price !== undefined) { patchData.patches.push({ op: "replace", path: "/purchasable_offer/0/our_price/0/schedule/0/value_with_tax", value: u.price }) }
      // This is already mapping u.price to our_price (standard price).
      // If we have reducedPrice, it maps to discounted_price.
      // And MSRP maps to list_price.
      content = content.replace(
        /if \(u\.reducedPrice !== undefined\) \{/,
        'if (u.msrp !== undefined) { patchData.patches.push({ op: "replace", path: "/purchasable_offer/0/list_price/0/value_with_tax", value: u.msrp }); }\n          if (u.reducedPrice !== undefined) {'
      )
    }
    
    fs.writeFileSync(file, content)
  }
}
