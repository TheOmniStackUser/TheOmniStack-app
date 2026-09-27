const fs = require('fs');

const file = 'src/app/api/auth/callback/otto/route.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /accessToken: userAccessToken,/g, 
  "isActive: true,\n        accessToken: userAccessToken,"
);

fs.writeFileSync(file, content);
console.log('Fixed isActive bug in callback route');
