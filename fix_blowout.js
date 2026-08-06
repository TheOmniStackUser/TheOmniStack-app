const fs = require('fs');
const file = 'src/app/(dashboard)/invoices/new/new-invoice-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix grid columns definition to use smaller fixed widths
content = content.replace(
  /className="grid grid-cols-1 md:grid-cols-\[128px_1fr_80px_120px_120px_70px_120px_auto\] gap-4 items-start bg-slate-50\/50 p-4 rounded-xl border border-slate-200"/g,
  'className="grid grid-cols-1 md:grid-cols-[90px_1fr_70px_90px_90px_70px_90px_auto] gap-4 items-start bg-slate-50/50 p-4 rounded-xl border border-slate-200"'
);

// 2. Remove whitespace-nowrap from labels in this block (lines 1190 to 1270 approx)
let lines = content.split('\n');
for (let i = 1180; i < 1280; i++) {
  if (lines[i] && lines[i].includes('whitespace-nowrap')) {
    lines[i] = lines[i].replace('whitespace-nowrap', '');
  }
}
content = lines.join('\n');

// 3. Add min-w-0 to the grid items (divs wrapping inputs) to prevent blowout
content = content.replace(/<div className="w-full">/g, '<div className="w-full min-w-0">');
content = content.replace(/<div className="w-full text-right">/g, '<div className="w-full min-w-0 text-right">');

fs.writeFileSync(file, content);
