const fs = require('fs')

const file = 'src/adapters/marketplace/mirakl.ts'
let content = fs.readFileSync(file, 'utf8')

// 1. Signature
content = content.replace('price?: number; fallbackPrice?: number }[]', 'price?: number; reducedPrice?: number; fallbackPrice?: number }[]')

// 2. Logic replacement
const oldLogic = `
        // Always preserve discount if it exists
        if (currentOffersMap[update.sku] && currentOffersMap[update.sku].discount) {
          const rawDisc = currentOffersMap[update.sku].discount;
          offer.discount = {};
          if (rawDisc.discount_price !== undefined) {
            offer.discount.price = rawDisc.discount_price;
          } else if (rawDisc.price !== undefined) {
            offer.discount.price = rawDisc.price;
          }
          if (rawDisc.start_date) {
            offer.discount.start_date = rawDisc.start_date;
          }
          if (rawDisc.end_date) {
            offer.discount.end_date = rawDisc.end_date;
          }
        }
`

const newLogic = `
        // Handle discount (sales price)
        if (update.reducedPrice !== undefined) {
          if (update.reducedPrice > 0) {
            // Set new discount
            const startDate = new Date();
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 10); // 10 years from now
            
            offer.discount = {
              discount_price: update.reducedPrice,
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString()
            }
          } else {
            // Remove discount (Mirakl allows removing by passing empty strings)
            offer.discount = {
              discount_price: null,
              start_date: null,
              end_date: null
            }
          }
        } else if (currentOffersMap[update.sku] && currentOffersMap[update.sku].discount) {
          // Preserve existing discount
          const rawDisc = currentOffersMap[update.sku].discount;
          offer.discount = {};
          if (rawDisc.discount_price !== undefined) {
            offer.discount.discount_price = rawDisc.discount_price;
          } else if (rawDisc.price !== undefined) {
            offer.discount.discount_price = rawDisc.price;
          }
          if (rawDisc.start_date) {
            offer.discount.start_date = rawDisc.start_date;
          }
          if (rawDisc.end_date) {
            offer.discount.end_date = rawDisc.end_date;
          }
        }
`

content = content.replace(oldLogic.trim(), newLogic.trim())

fs.writeFileSync(file, content)
console.log("Patched mirakl.ts")
