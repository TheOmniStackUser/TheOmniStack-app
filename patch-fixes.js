const fs = require('fs');

// Fix amazon.ts
let amazonCode = fs.readFileSync('src/adapters/marketplace/amazon.ts', 'utf8');
amazonCode = amazonCode.replace(
  /stock: stock,/g,
  "stock: stock !== null ? stock : undefined,"
);
fs.writeFileSync('src/adapters/marketplace/amazon.ts', amazonCode);

// Fix amazon-csv.ts
let csvCode = fs.readFileSync('src/app/actions/amazon-csv.ts', 'utf8');
csvCode = csvCode.replace(
  /await db\.insert\(products\)\.values\(\{\s*id: centralProductId,\s*companyId: auth\.activeCompanyId,\s*sku: sku,\s*name: title,\s*price: price\.toString\(\),\s*currentStock: stock !== null \? stock\.toString\(\) : '0',\s*\}\)/,
  `const inserted = await db.insert(products).values({
            companyId: auth.activeCompanyId,
            sku: sku,
            title: title,
            price: price.toString(),
            currentStock: stock !== null ? stock.toString() : '0',
          }).returning({ id: products.id })
          centralProductId = inserted[0].id`
);

fs.writeFileSync('src/app/actions/amazon-csv.ts', csvCode);
console.log("Patched fixes");
