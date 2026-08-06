const fs = require('fs');
const file = 'src/app/(dashboard)/invoices/new/new-invoice-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace container
content = content.replace(
  /className="flex flex-wrap md:flex-nowrap gap-4 items-start bg-slate-50\/50 p-4 rounded-xl border border-slate-200"/g,
  'className="grid grid-cols-1 md:grid-cols-[minmax(80px,8rem)_1fr_6rem_minmax(100px,8rem)_minmax(100px,8rem)_5rem_minmax(100px,8rem)_auto] gap-4 items-start bg-slate-50/50 p-4 rounded-xl border border-slate-200"'
);

// Remove specific width classes from children
content = content.replace(/className="w-32 shrink-0"/g, 'className="w-full"');
content = content.replace(/className="w-32"/g, 'className="w-full"');
content = content.replace(/className="w-24 shrink-0"/g, 'className="w-full"');
content = content.replace(/className="w-24"/g, 'className="w-full"');
content = content.replace(/className="w-20"/g, 'className="w-full"');
content = content.replace(/className="flex-1 min-w-\[120px\]"/g, 'className="w-full"');
content = content.replace(/className="flex-1 min-w-\[200px\]"/g, 'className="w-full"');
content = content.replace(/className="w-32 shrink-0 text-right"/g, 'className="w-full text-right"');
content = content.replace(/className="w-32 text-right"/g, 'className="w-full text-right"');

fs.writeFileSync(file, content);
