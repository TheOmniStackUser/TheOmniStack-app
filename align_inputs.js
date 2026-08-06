const fs = require('fs');
const file = 'src/app/(dashboard)/invoices/new/new-invoice-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove items-start from the grid container
content = content.replace(
  /className="grid grid-cols-1 md:grid-cols-\[90px_1fr_70px_90px_90px_70px_90px_auto\] gap-4 items-start bg-slate-50\/50 p-4 rounded-xl border border-slate-200"/g,
  'className="grid grid-cols-1 md:grid-cols-[90px_1fr_70px_90px_90px_70px_90px_auto] gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200"'
);

// 2. Add flex flex-col justify-end to all grid items
content = content.replace(/<div className="w-full min-w-0">/g, '<div className="w-full min-w-0 flex flex-col justify-end h-full">');
content = content.replace(/<div className="w-full min-w-0 text-right">/g, '<div className="w-full min-w-0 flex flex-col justify-end h-full text-right">');

// 3. Update the buttons container
content = content.replace(/<div className="flex-shrink-0 flex flex-col gap-0\.5 mt-5">/g, '<div className="flex-shrink-0 flex flex-col gap-0.5 self-end pb-[2px]">');

fs.writeFileSync(file, content);
