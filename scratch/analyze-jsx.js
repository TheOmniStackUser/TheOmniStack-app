const fs = require('fs');
const content = fs.readFileSync('/app/src/app/(dashboard)/orders/orders-table.tsx', 'utf8');

let openBraces = 0;
let openDivs = 0;

const lines = content.split('\n');
lines.forEach((line, i) => {
  const braces = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  openBraces += braces;
  
  const divs = (line.match(/<div/g) || []).length - (line.match(/<\/div>/g) || []).length;
  openDivs += divs;
});

console.log('Braces balance:', openBraces);
console.log('Divs balance:', openDivs);
