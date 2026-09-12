const fs = require('fs');

let content = fs.readFileSync('src/app/actions/amazon-csv.ts', 'utf8');

// Replace uuid with crypto
content = content.replace("import { v4 as uuidv4 } from 'uuid'", "import crypto from 'crypto'");
content = content.replace(/uuidv4\(\)/g, "crypto.randomUUID()");

// Fix product insert
content = content.replace(
  /id: centralProductId,([\s\S]*?)currentStock: stock !== null \? stock\.toString\(\) : null,/m,
  "id: centralProductId,$1currentStock: stock !== null ? stock.toString() : '0',"
);

// Fix mapping insert
content = content.replace(
  /id: crypto.randomUUID\(\),([\s\S]*?)rawMarketplaceData: \{ title, price, stock \}/m,
  "id: crypto.randomUUID(),$1marketplace: integration.type as any"
);

fs.writeFileSync('src/app/actions/amazon-csv.ts', content);
console.log("Patched amazon-csv.ts");
