const fs = require('fs');
let manualCode = fs.readFileSync('src/app/(dashboard)/orders/manual-import.tsx', 'utf8');
manualCode = manualCode.replace(
  /message = result\.message \|\| 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht\.'/g,
  `message = 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht.'`
);
fs.writeFileSync('src/app/(dashboard)/orders/manual-import.tsx', manualCode);
console.log("Patched 3");
