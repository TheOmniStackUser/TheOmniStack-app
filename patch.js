const fs = require('fs');

// Patch sync.ts
let syncCode = fs.readFileSync('src/app/actions/sync.ts', 'utf8');
syncCode = syncCode.replace(
  /for \(const integration of activeIntegrations\) \{[\s\S]*?revalidatePath\('\/orders'\)/,
  `
    for (const integration of activeIntegrations) {
      const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
      const syncGroupId = \`manual-\${Date.now()}\`
      await marketplaceSyncQueue.add(
        \`sync-\${integration.type}\`,
        {
          companyId: auth.activeCompanyId,
          marketplace: integration.type as any,
          triggeredByUserId: auth.userId,
          integrationId: integration.id,
          syncGroupId,
          fromDate: data.fromDate,
          toDate: data.toDate,
          marketplaceDisplayName: (integration.metadata as any)?.customName || integration.type,
        },
        {
          jobId: \`manual-sync-\${integration.type}-\${integration.id}-\${auth.activeCompanyId}-\${Date.now()}\`
        }
      )
    }

    revalidatePath('/orders')
    return { success: true, background: true, message: 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht.' }
`
);
fs.writeFileSync('src/app/actions/sync.ts', syncCode);

// Patch manual-import.tsx
let manualCode = fs.readFileSync('src/app/(dashboard)/orders/manual-import.tsx', 'utf8');
manualCode = manualCode.replace(
  /if \(!hasError\) \{[\s\S]*?setNotification\(\{\s*message,\s*type: 'success'\s*\}\)/,
  `if (!hasError) {
        setSyncProgress({ current: selectedToSync.length, total: selectedToSync.length, label: 'Abgeschlossen', simulatedProgress: 100 })
        let message = 'Import abgeschlossen! Es wurden keine neuen Bestellungen gefunden.'
        if (result && result.background) {
          message = result.message || 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht.'
        } else if (totalAffected > 0) {
          message = \`Import erfolgreich! \${totalAffected} neue Bestellung(en) wurden hinzugefügt.\`
        } else if (totalChecked > 0) {
          message = \`Import abgeschlossen. Es wurden \${totalChecked} Bestellungen geprüft, aber alle waren bereits vorhanden (z.B. durch den automatischen Webhook-Import).\`
        }
        setNotification({ 
          message, 
          type: 'success' 
        })`
);
fs.writeFileSync('src/app/(dashboard)/orders/manual-import.tsx', manualCode);

console.log("Patched successfully");
