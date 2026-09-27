const fs = require('fs');
const file = 'src/adapters/marketplace/otto.ts';
let content = fs.readFileSync(file, 'utf8');

// The faulty body was:
/*
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'orders products shipments returns receipts availability price-reduction'
        }).toString(),
*/
// I will replace it with:
/*
        body: `scope=orders%20products%20shipments%20returns%20receipts%20availability%20price-reduction`,
*/
const oldBodyRegex = /body: new URLSearchParams\(\{\s*grant_type: 'client_credentials',\s*scope: 'orders products shipments returns receipts availability price-reduction'\s*\}\)\.toString\(\),/g;
const newBody = "body: `scope=orders%20products%20shipments%20returns%20receipts%20availability%20price-reduction`,";

content = content.replace(oldBodyRegex, newBody);

fs.writeFileSync(file, content);
console.log('Fixed installation token fetch body');
