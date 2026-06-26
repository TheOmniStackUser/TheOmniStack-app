import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { orders } from './src/db/schema/orders';
import { invoices, invoiceItems } from './src/db/schema/invoices';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, and } from 'drizzle-orm';
import { getAdapterForIntegration } from './src/workers/marketplace-sync';
import type { OttoAdapter } from './src/adapters/marketplace/otto';
import { uploadDocument, buildInvoiceKey } from './src/lib/storage';

async function main() {
  const activeIntegrations = await db.select()
    .from(marketplaceIntegrations)
    .where(and(eq(marketplaceIntegrations.isActive, true), eq(marketplaceIntegrations.type, 'otto')));

  console.log(`Starting historical Otto credit notes backfill for ${activeIntegrations.length} active integrations...`);

  let totalDownloaded = 0;

  for (const integration of activeIntegrations) {
    const companyId = integration.companyId;
    console.log(`\n--- Processing integration ${integration.id} (Company: ${companyId}) ---`);

    try {
      const adapter = getAdapterForIntegration(integration) as any;
      const token = await adapter.getAccessToken();

      let url: string | null = `${adapter.baseUrl}/v3/receipts?limit=100`;
      let page = 0;
      let integrationDownloaded = 0;

      while (url) {
        page++;
        console.log(`  [Page ${page}] Fetching ${url}`);
        
        let res: Response | undefined;
        try {
          res = await fetch(url as string, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(15000)
          });
        } catch (e) {
          console.error(`  Failed to fetch page ${page}:`, e);
          break;
        }

        if (!res || !res.ok) {
          console.warn(`  Failed to fetch receipts: ${res?.status}`);
          break;
        }

        const data = await res.json();
        const resources = data.resources || [];
        
        for (const receipt of resources) {
          if (receipt.receiptType === 'REFUND') {
            const orderInDb = await db.query.orders.findFirst({
              where: and(
                eq(orders.marketplace, 'otto'), 
                eq(orders.marketplaceOrderId, receipt.salesOrderId),
                eq(orders.companyId, companyId)
              )
            });

            if (!orderInDb) {
              continue;
            }

            let needsCreditNote = false;
            if (!orderInDb.invoiceId) {
              needsCreditNote = true;
            } else {
              const creditNote = await db.query.invoices.findFirst({
                where: and(
                  eq(invoices.cancelsInvoiceId, orderInDb.invoiceId), 
                  eq(invoices.isCreditNote, true),
                  eq(invoices.companyId, companyId)
                )
              });
              if (!creditNote) {
                needsCreditNote = true;
              }
            }

            if (needsCreditNote) {
              console.log(`  [Found Missing] Downloading refund ${receipt.receiptNumber} for order ${receipt.salesOrderId}...`);
              
              const result = await adapter.getReceiptPdfByNumber(receipt.receiptNumber);
              if (result && result.pdfBuffer) {
                const originalInvoice = orderInDb.invoiceId ? await db.query.invoices.findFirst({
                  where: eq(invoices.id, orderInDb.invoiceId)
                }) : null;

                const creditNoteNumber = result.receiptNumber;
                const storageKey = buildInvoiceKey(companyId, creditNoteNumber);
                await uploadDocument(storageKey, result.pdfBuffer);

                await db.transaction(async (tx) => {
                  const [newInvoice] = await tx.insert(invoices).values({
                    companyId,
                    documentType: 'invoice',
                    invoiceNumber: creditNoteNumber,
                    status: 'issued',
                    recipientName: originalInvoice ? originalInvoice.recipientName : (orderInDb.shippingName || orderInDb.buyerName || 'Kunde'),
                    recipientStreet: originalInvoice ? originalInvoice.recipientStreet : (orderInDb.shippingStreet || ''),
                    recipientZip: originalInvoice ? originalInvoice.recipientZip : (orderInDb.shippingZip || ''),
                    recipientCity: originalInvoice ? originalInvoice.recipientCity : (orderInDb.shippingCity || ''),
                    recipientCountry: originalInvoice ? originalInvoice.recipientCountry : (orderInDb.shippingCountry || 'DE'),
                    recipientEmail: originalInvoice ? originalInvoice.recipientEmail : (orderInDb.buyerEmail || null),
                    currency: orderInDb.currency || 'EUR',
                    subtotalAmount: '0.00',
                    taxAmount: '0.00',
                    totalAmount: '0.00',
                    taxRate: '0.0000',
                    isCreditNote: true,
                    cancelsInvoiceId: originalInvoice ? originalInvoice.id : null,
                    dueAt: new Date(),
                    pdfStorageKey: storageKey,
                    pdfGeneratedAt: new Date(),
                    issuedAt: new Date(),
                    paidAt: new Date()
                  }).returning({ id: invoices.id });

                  await tx.insert(invoiceItems).values({
                    invoiceId: newInvoice.id,
                    companyId,
                    position: '1',
                    sku: 'REFUND',
                    description: `Vom Marktplatz heruntergeladene Gutschrift für ${orderInDb.marketplaceOrderId}`,
                    quantity: '1',
                    unitPrice: '0.00',
                    taxRate: '0.00',
                    lineTotal: '0.00',
                  });
                });
                
                integrationDownloaded++;
                totalDownloaded++;
                console.log(`  [Success] Saved credit note ${creditNoteNumber} (Total so far: ${totalDownloaded})`);
              }
            }
          }
        }

        const nextLink = (data.links || []).find((l:any) => l.rel === 'next');
        url = nextLink ? (nextLink.href.startsWith('http') ? nextLink.href : adapter.baseUrl + nextLink.href) : null;
      }
      
      console.log(`--- Finished integration ${integration.id}. Downloaded ${integrationDownloaded} credit notes. ---`);

    } catch (error) {
      console.error(`Error processing integration ${integration.id}:`, error);
    }
  }

  console.log(`\nAll done! Successfully backfilled ${totalDownloaded} historical Otto credit notes.`);
  process.exit(0);
}

main().catch(console.error);
