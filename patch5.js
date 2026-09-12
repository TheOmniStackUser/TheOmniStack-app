const fs = require('fs');
let syncCode = fs.readFileSync('src/app/actions/sync.ts', 'utf8');

// Replace everything from `let totalChecked = 0` up to the end of the `if` block with just the enqueue loop.
syncCode = syncCode.replace(
  /let totalChecked = 0[\s\S]*?return \{ success: true, message: \`Import erfolgreich! \$\{totalAffected\} neue Bestellung\(en\) wurden hinzugefügt\.\`, affected: totalAffected, checked: totalChecked \}/,
  `for (const integration of activeIntegrations) {
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
    return { success: true, background: true, message: 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht.' }`
);

fs.writeFileSync('src/app/actions/sync.ts', syncCode);
console.log("Patched 5");
