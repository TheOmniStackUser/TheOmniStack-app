const fs = require('fs');
const file = 'src/adapters/marketplace/otto.ts';
let content = fs.readFileSync(file, 'utf8');

const oldUrlCode = `const tokenUrl = this.config.environment === 'sandbox'
          ? 'https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token'
          : 'https://api.otto.market/oauth2/token'`;
          
const newUrlCode = `const tokenUrl = this.config.environment === 'sandbox'
          ? 'https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token'
          : 'https://portal.otto.market/sec-api/auth/realms/otto-partner/protocol/openid-connect/token'`;

content = content.replace(oldUrlCode, newUrlCode);
fs.writeFileSync(file, content);
console.log('Fixed refresh token URL');
