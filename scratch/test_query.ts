import { db } from '../src/db/client';
import { invoices } from '../src/db/schema/invoices';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

const envFile = fs.readFileSync('./.env', 'utf8');
const match = envFile.match(/^DATABASE_URL="([^"]+)"/m);
if (match) {
  process.env.DATABASE_URL = match[1];
}

async function main() {
  const result = await db.select({
    currency: invoices.currency,
    isCreditNote: invoices.isCreditNote,
    status: invoices.status,
    totalGross: sql<number>`sum(${invoices.totalAmount}::numeric)`,
    totalNet: sql<number>`sum(${invoices.subtotalAmount}::numeric)`
  })
  .from(invoices)
  .groupBy(invoices.currency, invoices.isCreditNote, invoices.status);
  
  console.log(result);
  process.exit(0);
}
main();
