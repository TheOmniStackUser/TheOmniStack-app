import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { returnsLog } from './src/db/schema/returns';
import { orders } from './src/db/schema/orders';
import { invoices } from './src/db/schema/invoices';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, and } from 'drizzle-orm';
import { getAdapterForIntegration } from './src/workers/marketplace-sync';
import type { MiraklAdapter } from './src/adapters/marketplace/mirakl';
import { buildInvoiceKey, uploadDocument } from './src/lib/storage';

async function main() {
  console.log('Fetching Mirakl returns log...');
  const allReturns = await db.query.returnsLog.findMany();

  const targetReturns = allReturns.filter(r => {
    const marketplace = (r.marketplace || '').toLowerCase();
    return marketplace.includes('limango') || marketplace.includes('mirakl') || marketplace.includes('decathlon');
  }).filter(r => {
    const meta = r.metadata as any;
    return !meta || !meta.creditNoteId;
  });

  console.log(`Found ${targetReturns.length} Mirakl returns needing a credit note.`);

  for (const ret of targetReturns) {
    console.log(`Processing Mirakl return ${ret.id} for order ${ret.orderNumber}...`);
    
    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: (int, { eq, and }) => and(
        eq(int.companyId, ret.companyId), 
        eq(int.isActive, true),
        eq(int.type, 'mirakl_custom') // Assuming Limango is mirakl_custom
      )
    }) || await db.query.marketplaceIntegrations.findFirst({
      where: (int, { eq, and }) => and(
        eq(int.companyId, ret.companyId), 
        eq(int.isActive, true),
        eq(int.type, 'mirakl_decathlon')
      )
    });

    if (!integration) {
      console.warn('  -> No active integration found.');
      continue;
    }

    const adapter = getAdapterForIntegration(integration);
    try {
      const token = await (adapter as any).getAccessToken();
      const headers: any = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else headers['Authorization'] = (adapter as any).config.apiKey;

      const docUrl = `${(adapter as any).config.baseUrl}/api/orders/documents?order_ids=${ret.orderNumber}`;
      console.log(`  -> Fetching docs: ${docUrl}`);
      const res = await fetch(docUrl, { headers });
      if (!res.ok) {
        console.warn(`  -> API Error: ${res.status} ${await res.text()}`);
        continue;
      }
      
      const data = await res.json();
      const documents = data.order_documents || [];
      const creditNoteDoc = documents.find((d: any) => d.type_code === 'CUSTOMER_CREDIT_NOTE' || d.type_code === 'REFUND');

      if (!creditNoteDoc) {
        console.warn('  -> No credit note document found in API response.');
        continue;
      }

      console.log(`  -> Found document: ${creditNoteDoc.id}. Downloading...`);
      const dlUrl = `${(adapter as any).config.baseUrl}/api/orders/documents/download?document_ids=${creditNoteDoc.id}`;
      const dlRes = await fetch(dlUrl, { headers });
      
      if (!dlRes.ok) {
        console.warn(`  -> Download failed: ${dlRes.status}`);
        continue;
      }

      const pdfBuffer = await dlRes.arrayBuffer();
      const creditNoteNumber = creditNoteDoc.document_number || `GS-MIRAKL-${ret.orderNumber}`;
      const storageKey = buildInvoiceKey(ret.companyId, creditNoteNumber);
      
      await uploadDocument(storageKey, Buffer.from(pdfBuffer));

      await db.transaction(async (tx) => {
        // Find original invoice
        const order = await tx.query.orders.findFirst({
          where: eq(orders.id, ret.orderId!)
        });

        let cancelsId = null;
        if (order && order.invoiceId) {
          cancelsId = order.invoiceId;
        }

        const [newCreditNoteInvoice] = await tx.insert(invoices).values({
          companyId: ret.companyId,
          invoiceNumber: creditNoteNumber,
          status: 'issued',
          documentType: 'invoice',
          recipientName: 'Mirakl Customer',
          currency: 'EUR',
          subtotalAmount: '0',
          taxAmount: '0',
          totalAmount: '0',
          taxRate: '0.19',
          isCreditNote: true,
          cancelsInvoiceId: cancelsId,
          dueAt: new Date(),
          pdfStorageKey: storageKey,
          pdfGeneratedAt: new Date(),
          issuedAt: new Date()
        }).returning({ id: invoices.id });

        const existingMetadata = (ret.metadata as Record<string, any>) || {};
        await tx.update(returnsLog)
          .set({
            metadata: {
              ...existingMetadata,
              creditNoteId: newCreditNoteInvoice.id
            }
          })
          .where(eq(returnsLog.id, ret.id));
      });

      console.log(`  -> Success! Saved Mirakl credit note ${creditNoteNumber}.`);

    } catch(e) {
      console.error('  -> Error processing Mirakl return:', e);
    }
  }

  process.exit(0);
}

main().catch(console.error);
