const fs = require('fs');
const file = 'src/adapters/marketplace/otto.ts';
let content = fs.readFileSync(file, 'utf8');

// The faulty assignment was:
// (this.config.metadata as any)?.connectionType = isPrivate ? 'service_partner' : 'private'
// We will replace it with:
// if (this.config.metadata) { (this.config.metadata as any).connectionType = isPrivate ? 'service_partner' : 'private'; }

content = content.replace(
  /\(this\.config\.metadata as any\)\?\.connectionType = isPrivate \? 'service_partner' : 'private'/g,
  "if (this.config.metadata) { (this.config.metadata as any).connectionType = isPrivate ? 'service_partner' : 'private'; }"
);

fs.writeFileSync(file, content);
console.log('Fixed optional chaining assignment syntax error');
