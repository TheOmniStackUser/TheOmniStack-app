const fs = require('fs');

// Fix manual-import.tsx
let manualCode = fs.readFileSync('src/app/(dashboard)/orders/manual-import.tsx', 'utf8');
manualCode = manualCode.replace(
  /if \(result\.affected !== undefined\) \{[\s\S]*?totalChecked \+= result\.checked\n        \}/,
  `if ((result as any).affected !== undefined) {
          totalAffected += (result as any).affected
        }
        if ((result as any).checked !== undefined) {
          totalChecked += (result as any).checked
        }`
);
fs.writeFileSync('src/app/(dashboard)/orders/manual-import.tsx', manualCode);

// Fix sync-button.tsx
let syncButtonCode = fs.readFileSync('src/app/(dashboard)/dashboard/sync-button.tsx', 'utf8');
syncButtonCode = syncButtonCode.replace(
  /if \(result\.affected !== undefined\) \{[\s\S]*?totalChecked \+= result\.checked\n          \}/,
  `if ((result as any).affected !== undefined) {
            totalAffected += (result as any).affected
          }
          if ((result as any).checked !== undefined) {
            totalChecked += (result as any).checked
          }`
);
fs.writeFileSync('src/app/(dashboard)/dashboard/sync-button.tsx', syncButtonCode);

console.log("Patched 6");
