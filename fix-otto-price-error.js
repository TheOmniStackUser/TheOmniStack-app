const fs = require('fs');

let ottoTs = fs.readFileSync('src/adapters/marketplace/otto.ts', 'utf8');

// Replace the throw new Error with console.error
ottoTs = ottoTs.replace(
  "throw new Error(`Otto API Fehler beim Preisabgleich: ${pRes.status} - ${errText}`)",
  "console.error(`[OttoAdapter] Otto API Fehler beim Preisabgleich: ${pRes.status} - ${errText}`);\n            // We don't throw here so that stock updates (which already succeeded) are not rolled back in the user's mind."
);

fs.writeFileSync('src/adapters/marketplace/otto.ts', ottoTs);
