import { db } from './src/db/client';
import { marketplaceIntegrations, orders, invoices } from './src/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildDeliveryNoteKey, buildInvoiceKey, deleteDocument, uploadDocument } from './src/lib/storage';
import { MiraklAdapter } from './src/adapters/marketplace/mirakl';

async function main() {
  const orderList = await db.select().from(orders).where(eq(orders.marketplaceOrderId, '20260618905-A'));
  if (orderList.length === 0) {
    console.log("Order not found");
    process.exit(1);
  }
  const order = orderList[0];
  const companyId = order.companyId;

  // Delete generated invoice
  if (order.invoiceId) {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, order.invoiceId) });
    if (inv) {
      if (inv.pdfStorageKey) {
        await deleteDocument(inv.pdfStorageKey);
        console.log(`Deleted invoice PDF from storage: ${inv.pdfStorageKey}`);
      }
      await db.delete(invoices).where(eq(invoices.id, order.invoiceId));
      console.log(`Deleted generated invoice from DB.`);
    }
  }

  await db.update(orders).set({ invoiceId: null }).where(eq(orders.id, order.id));
  console.log("Cleared invoiceId on order.");

  // Delete generated delivery note
  const deliveryNoteKey = buildDeliveryNoteKey(companyId, order.id);
  await deleteDocument(deliveryNoteKey);
  console.log(`Deleted delivery note PDF from storage (if existed).`);

  // Download delivery note from Limango
  const integrationList = await db.select().from(marketplaceIntegrations).where(
    and(
      eq(marketplaceIntegrations.companyId, companyId),
      eq(marketplaceIntegrations.type, 'mirakl_custom')
    )
  );

  let limangoIntegration = null;
  for (const integ of integrationList) {
    const meta = integ.metadata as any;
    if (meta && (meta.customName?.toLowerCase() === 'limango' || meta.marketplaceName?.toLowerCase() === 'limango')) {
      limangoIntegration = integ;
      break;
    }
  }

  if (limangoIntegration) {
    const meta = limangoIntegration.metadata as any || {};
    const config = {
      instance: 'limango',
      apiKey: limangoIntegration.apiKey || '',
      clientId: limangoIntegration.clientId || '',
      clientSecret: limangoIntegration.clientSecret || '',
      shopId: meta.shopId || '',
      baseUrl: limangoIntegration.environment || 'https://limango.mirakl.net'
    };

    const adapter = new MiraklAdapter(config);
    const token = await (adapter as any).getAccessToken();

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['Authorization'] = config.clientId || config.apiKey || '';
      headers['X-Mirakl-Api-Key'] = config.clientId || config.apiKey || '';
    }

    const docListUrl = `${config.baseUrl}/api/orders/documents?order_ids=20260618905-A&shop_id=${config.shopId}`;
    const response = await fetch(docListUrl, { headers });
    const data = await response.json();
    
    const docs = data.order_documents || data.orders?.[0]?.documents || [];
    const deliveryNote = docs.find((d: any) => d.type === 'SYSTEM_DELIVERY_BILL' || d.type_code === 'SYSTEM_DELIVERY_BILL' || d.type === 'DELIVERY_NOTE');
    const invoice = docs.find((d: any) => d.type === 'INVOICE' || d.type_code === 'INVOICE');

    if (deliveryNote) {
      console.log(`Found delivery note on Limango (ID: ${deliveryNote.id})`);
      const downloadUrl = `${config.baseUrl}/api/orders/documents/download?document_ids=${deliveryNote.id}&shop_id=${config.shopId}`;
      const dlRes = await fetch(downloadUrl, { headers });
      if (dlRes.ok) {
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        await uploadDocument(deliveryNoteKey, buffer);
        console.log(`Downloaded and saved delivery note to ${deliveryNoteKey}`);
      } else {
        console.log(`Failed to download delivery note: ${dlRes.status}`);
      }
    } else {
      console.log("No delivery note found on Limango.");
    }

    if (invoice) {
      console.log(`Found invoice on Limango (ID: ${invoice.id})`);
      const downloadUrl = `${config.baseUrl}/api/orders/documents/download?document_ids=${invoice.id}&shop_id=${config.shopId}`;
      const dlRes = await fetch(downloadUrl, { headers });
      if (dlRes.ok) {
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        const invoiceNumber = invoice.file_name || `INV-20260618905-A`;
        const invoiceKey = buildInvoiceKey(companyId, invoiceNumber);
        await uploadDocument(invoiceKey, buffer);
        console.log(`Downloaded and saved invoice to ${invoiceKey}`);
        
        // create invoice DB record
        const [newInv] = await db.insert(invoices).values({
          companyId,
          documentType: 'invoice',
          invoiceNumber,
          status: 'issued',
          recipientName: order.buyerName || 'Limango Customer',
          subtotalAmount: '0.00',
          taxAmount: '0.00',
          totalAmount: '0.00',
          taxRate: '0.19',
          pdfStorageKey: invoiceKey,
          pdfGeneratedAt: new Date(),
          issuedAt: new Date()
        }).returning({ id: invoices.id });

        await db.update(orders).set({ invoiceId: newInv.id }).where(eq(orders.id, order.id));
        console.log("Saved invoice to DB and linked to order.");
      }
    } else {
      console.log("No invoice found on Limango.");
    }
  }

  process.exit(0);
}

main().catch(console.error);
