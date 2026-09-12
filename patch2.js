const fs = require('fs');
let manualCode = fs.readFileSync('src/app/(dashboard)/orders/manual-import.tsx', 'utf8');
manualCode = manualCode.replace(
  /if \(result && result\.background\)/,
  `if (true)` // Just always show background message if no error
);
fs.writeFileSync('src/app/(dashboard)/orders/manual-import.tsx', manualCode);
console.log("Patched 2");
