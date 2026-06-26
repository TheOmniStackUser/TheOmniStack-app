import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/db/client';
import { invoices } from './src/db/schema/invoices';
import { orders } from './src/db/schema/orders';
import { eq, sql, like } from 'drizzle-orm';

async function main() {
  const counts = await db.select({
    documentType: invoices.documentType,
    isCreditNote: invoices.isCreditNote,
    count: sql`count(*)`
  }).from(invoices).groupBy(invoices.documentType, invoices.isCreditNote);
  
  console.log("Counts by document type:");
  console.log(counts);

  const foundOrders = await db.select({
    id: orders.id,
    marketplaceOrderId: orders.marketplaceOrderId,
    invoiceId: orders.invoiceId,
    status: orders.status
  }).from(orders).where(like(orders.marketplaceOrderId, '%DE5M1HBTYPEM%'));

  console.log("\nFound orders:");
  console.log(foundOrders);

  if (foundOrders.length > 0) {
    const foundInvoices = await db.select().from(invoices).where(eq(invoices.id, foundOrders[0].invoiceId || ''));
    console.log("\nInvoice for order 1:");
    console.log(foundInvoices);
  }

  const foundGutschriften = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    documentType: invoices.documentType,
    isCreditNote: invoices.isCreditNote
  }).from(invoices).where(like(invoices.invoiceNumber, '%DE5M1HBTYPEM%'));

  console.log("\nFound invoices by number DE5M1HBTYPEM:");
  console.log(foundGutschriften);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
