const fs = require('fs');
let envLocal = fs.readFileSync('.env.local', 'utf8');

// Update OTTO_APP_CLIENT_ID
if (envLocal.includes('OTTO_APP_CLIENT_ID=')) {
  envLocal = envLocal.replace(/OTTO_APP_CLIENT_ID=.*/g, 'OTTO_APP_CLIENT_ID="b93fd38d-4098-49a0-af5d-d57ed1162043"');
} else {
  envLocal += '\nOTTO_APP_CLIENT_ID="b93fd38d-4098-49a0-af5d-d57ed1162043"\n';
}

// Update OTTO_APP_CLIENT_SECRET
if (envLocal.includes('OTTO_APP_CLIENT_SECRET=')) {
  envLocal = envLocal.replace(/OTTO_APP_CLIENT_SECRET=.*/g, 'OTTO_APP_CLIENT_SECRET="3f481506-f051-4b0a-8538-e8b6a21692d8"');
} else {
  envLocal += 'OTTO_APP_CLIENT_SECRET="3f481506-f051-4b0a-8538-e8b6a21692d8"\n';
}

fs.writeFileSync('.env.local', envLocal);
console.log('Updated .env.local');
