import { db } from './src/db/client';
import { invoices } from './src/db/schema/invoices';
import { eq } from 'drizzle-orm';

async function main() {
  const cancels = await db.select().from(invoices).where(eq(invoices.cancelsInvoiceId, '488b6e89-4f2c-4ea9-ab7b-60544e328e48'));
  console.log("Credit notes for DE5M1HBTYPEM-A invoice:");
  console.log(cancels);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
