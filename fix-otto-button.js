const fs = require('fs');

const file = 'src/app/(dashboard)/integrations/otto-form.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldLink = '/api/auth/otto?environment=${environment}&companyId=${companyId}';
const newLink = 'https://portal.otto.market/apps/theomnistackapp/versions/1';

content = content.replace(oldLink, newLink);
// We also need to remove the template literal syntax since it's a static string now.
content = content.replace(/href={`https:\/\/portal.otto.market\/apps\/theomnistackapp\/versions\/1`}/, 'href="https://portal.otto.market/apps/theomnistackapp/versions/1"');

fs.writeFileSync(file, content);
console.log('Fixed button link');
