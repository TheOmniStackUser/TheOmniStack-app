const fs = require('fs')
const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

const replacement = `
                const { triggerMarketplaceSyncForProducts } = await import('@/app/actions/products');
                showToast('Sync wird gestartet, bitte warten...', 'info');
                try {
                  const productIds = Array.from(selectedProductIds);
                  const chunkSize = 20;
                  const failed = [];
                  for (let i = 0; i < productIds.length; i += chunkSize) {
                    const chunk = productIds.slice(i, i + chunkSize);
                    const result = await triggerMarketplaceSyncForProducts(chunk);
                    if (result.failedMarketplaces && result.failedMarketplaces.length > 0) {
                      failed.push(...result.failedMarketplaces);
                    }
                  }
                  
                  if (failed.length > 0) {
                    showToast(\`Sync mit Fehlern beendet. Bitte Logs prüfen.\`, 'error')
                  } else {
                    showToast(\`Sync für \${selectedProductIds.size} Produkte erfolgreich!\`, 'success');
                  }
                  setSelectedProductIds(new Set());
                } catch (error) {
`

content = content.replace(
  /const \{ triggerMarketplaceSyncForProducts \} = await import\('@\/app\/actions\/products'\);\s*showToast\('Sync wird gestartet\.\.\.', 'info'\);\s*try \{\s*const result = await triggerMarketplaceSyncForProducts\(Array\.from\(selectedProductIds\)\);\s*if \(result\.failedMarketplaces && result\.failedMarketplaces\.length > 0\) \{\s*const errors = result\.failedMarketplaces\.map\(\(f: any\) => `\$\{f\.name\}: \$\{f\.error\}`\)\.join\(' \| '\)\s*showToast\(`Sync mit Fehlern beendet: \$\{errors\}`\, 'error'\)\s*\} else \{\s*showToast\(`Sync für \$\{selectedProductIds\.size\} Produkte erfolgreich an Marktplätze übermittelt!`\, 'success'\);\s*\}\s*setSelectedProductIds\(new Set\(\)\);\s*\} catch \(error\) \{/,
  replacement
)

fs.writeFileSync(file, content)
