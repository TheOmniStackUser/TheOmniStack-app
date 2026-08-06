const fs = require('fs');
const file = 'src/app/(dashboard)/invoices/new/new-invoice-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Revert grid items to normal block elements
content = content.replace(/<div className="w-full min-w-0 flex flex-col justify-end h-full">/g, '<div className="w-full min-w-0">');
content = content.replace(/<div className="w-full min-w-0 flex flex-col justify-end h-full text-right">/g, '<div className="w-full min-w-0 text-right">');

// 2. Make all labels flex items-end h-8
content = content.replace(/<label className="block text-\[10px\] font-bold text-slate-600 uppercase mb-1 ">/g, '<label className="flex items-end text-[10px] font-bold text-slate-600 uppercase mb-1 h-8">');

// 3. Fix the buttons container alignment
content = content.replace(/<div className="flex-shrink-0 flex flex-col gap-0\.5 self-end pb-\[2px\]">/g, '<div className="flex-shrink-0 flex flex-col gap-0.5 mt-9">');

fs.writeFileSync(file, content);
