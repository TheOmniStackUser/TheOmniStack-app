const fs = require('fs');
let manualCode = fs.readFileSync('src/app/(dashboard)/orders/manual-import.tsx', 'utf8');

manualCode = manualCode.replace(
  /let totalAffected = 0\n    let totalChecked = 0\n    let hasError = false/,
  `let totalAffected = 0
    let totalChecked = 0
    let hasError = false
    let isBackground = false
    let backgroundMessage = ''`
);

manualCode = manualCode.replace(
  /if \(result\.error\) \{[\s\S]*?break\n        \}/,
  `if (result.error) {
          hasError = true
          setNotification({ message: result.error, type: 'error' })
          break
        }
        if (result.background) {
          isBackground = true
          backgroundMessage = result.message || 'Import wurde im Hintergrund gestartet!'
        }`
);

manualCode = manualCode.replace(
  /if \(\!hasError\) \{[\s\S]*?setNotification\(\{/,
  `if (!hasError) {
        setSyncProgress({ current: selectedToSync.length, total: selectedToSync.length, label: 'Abgeschlossen', simulatedProgress: 100 })
        let message = 'Import abgeschlossen! Es wurden keine neuen Bestellungen gefunden.'
        if (isBackground) {
          message = backgroundMessage
        } else if (totalAffected > 0) {
          message = \`Import erfolgreich! \${totalAffected} neue Bestellung(en) wurden hinzugefügt.\`
        } else if (totalChecked > 0) {
          message = \`Import abgeschlossen. Es wurden \${totalChecked} Bestellungen geprüft, aber alle waren bereits vorhanden (z.B. durch den automatischen Webhook-Import).\`
        }
        setNotification({`
);

fs.writeFileSync('src/app/(dashboard)/orders/manual-import.tsx', manualCode);
console.log("Patched 4");
