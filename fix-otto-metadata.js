const fs = require('fs');
const file = 'src/adapters/marketplace/otto.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/this\.config\.installationId/g, '(this.config.metadata as any)?.installationId');
content = content.replace(/this\.config\.appId/g, '(this.config.metadata as any)?.appId');
content = content.replace(/this\.config\.connectionType/g, '(this.config.metadata as any)?.connectionType');

fs.writeFileSync(file, content);
console.log('Fixed metadata access in otto.ts');
