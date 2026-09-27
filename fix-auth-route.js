const fs = require('fs');

const routeFiles = [
  'src/app/api/auth/otto/route.ts',
  'src/app/api/auth/callback/otto/route.ts'
];

for (const file of routeFiles) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/'7dad7649-bdee-4593-8a65-c74f28693507'/g, "'b93fd38d-4098-49a0-af5d-d57ed1162043'");
  
  if (file.includes('callback')) {
    content = content.replace(/'9d8f8b8f-6ee7-4f78-b844-15332634b760'/g, "'3f481506-f051-4b0a-8538-e8b6a21692d8'");
  }
  
  fs.writeFileSync(file, content);
}

// Now rewrite the UI in otto-form.tsx to be a single Amazon-style button!
let formContent = fs.readFileSync('src/app/(dashboard)/integrations/otto-form.tsx', 'utf8');

// Replace everything between {/* SERVICE PARTNER: Invitation link -> sets cookie first */} and {/* RETURN ADDRESS */}
const oldUiRegex = /\{\/\* SERVICE PARTNER: Invitation link → sets cookie first \*\/\}.*?\{\/\* RETURN ADDRESS \*\/\}/s;

const newUi = `
      {/* SERVICE PARTNER: Public App OAuth Flow */}
      <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
        <div>
          <p className="font-semibold text-blue-900 mb-1">Mit OTTO verbinden</p>
          <p className="text-sm text-blue-800 leading-relaxed">
            Klicke auf den Button, um TheOmniStack mit deinem OTTO-Händlerkonto zu verbinden.
          </p>
        </div>

        <a
          href={\`/api/auth/otto?environment=\${environment}&companyId=\${companyId}\`}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
          onClick={() => {
            document.cookie = \`otto_oauth_company_id=\${companyId}; path=/; max-age=3600; SameSite=Lax\`;
          }}
        >
          <ExternalLink className="w-4 h-4" />
          Jetzt mit OTTO verbinden
        </a>
      </div>

      {/* RETURN ADDRESS */}`;

formContent = formContent.replace(oldUiRegex, newUi);

// Also remove inviteLink state and handleConnectOtto
formContent = formContent.replace(/const \[inviteLink, setInviteLink\] = useState\(''\)/, '');
formContent = formContent.replace(/const handleConnectOtto = \(\) => \{[\s\S]*?\}/, '');

fs.writeFileSync('src/app/(dashboard)/integrations/otto-form.tsx', formContent);
console.log('Fixed UI and API routes');
