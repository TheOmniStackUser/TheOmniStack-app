import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { returnsLog } from './src/db/schema/returns';
import { orders } from './src/db/schema/orders';
import { invoices, invoiceItems, invoiceLogs } from './src/db/schema/invoices';
import { companies } from './src/db/schema/companies';
import { eq, and, ne } from 'drizzle-orm';
import { buildInvoiceKey, uploadDocument } from './src/lib/storage';
import { createInvoiceForOrder, getDefaultSettings, formatDocumentNumber } from './src/lib/invoice-service';
import React from 'react';

async function generateCreditNoteForReturn(returnEntry: any, companyId: string, order: any, itemsToRefund: any[]) {
  let creditNoteNumber = '';
  let newCreditNoteInvoiceId = '';
  let pdfBuffer: Buffer | null = null;

  if (!order.invoiceId) {
    console.log(`[Backfill] Order ${order.marketplaceOrderId} has no linked invoice. Creating invoice first...`);
    const invoiceResult = await createInvoiceForOrder(order.id, companyId, { txContext: undefined });
    if (!invoiceResult) {
      console.error(`  -> Failed to create invoice automatically.`);
      return false;
    }
    const reloaded = await db.query.orders.findFirst({
      where: eq(orders.id, order.id)
    });
    order.invoiceId = reloaded?.invoiceId || null;
  }

  if (!order.invoiceId) {
    console.error(`  -> Still no invoiceId for order ${order.marketplaceOrderId}.`);
    return false;
  }

  const originalInvoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, order.invoiceId), eq(invoices.companyId, companyId))
  });

  if (!originalInvoice) {
    console.error(`  -> Invoice ${order.invoiceId} not found.`);
    return false;
  }

  if (originalInvoice.status === 'cancelled') {
    console.error(`  -> Original invoice ${originalInvoice.invoiceNumber} is cancelled.`);
    return false;
  }

  const creditNoteItems: any[] = [];
  let subtotalAmount = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  for (const refundItem of itemsToRefund) {
    if (refundItem.quantity <= 0) continue;

    const matchedOrderItem = order.items.find(
      (item: any) => item.sku?.toLowerCase() === refundItem.sku.toLowerCase() || item.title?.toLowerCase().includes(refundItem.sku.toLowerCase())
    ) || order.items[0]; // fallback to first item if EAN/SKU mapping failed in this simple script

    if (!matchedOrderItem) continue;

    const qty = refundItem.quantity;
    const netUnitPrice = parseFloat(matchedOrderItem.unitPrice || '0');
    const taxRate = parseFloat(matchedOrderItem.taxRate || '0.19');

    const lineNet = netUnitPrice * qty;
    const lineTax = lineNet * taxRate;
    const lineGross = lineNet + lineTax;

    subtotalAmount += lineNet;
    taxAmount += lineTax;
    totalAmount += lineGross;

    creditNoteItems.push({
      sku: matchedOrderItem.sku || 'UNKNOWN',
      title: matchedOrderItem.title,
      quantity: qty,
      unitPrice: netUnitPrice,
      taxRate: taxRate,
      description: matchedOrderItem.title
    });
  }

  if (creditNoteItems.length === 0) {
    console.error(`  -> No matching items found to refund.`);
    return false;
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const dbSettings = company.documentNumberSettings as any;
  const config = dbSettings?.creditNote || getDefaultSettings('creditNote', company);

  if (config && config.auto) {
    const nextNum = parseInt(config.next, 10) || 1;
    creditNoteNumber = formatDocumentNumber(config.format, nextNum, config.padding || 5, order.customerNumber || '', '', new Date());
  } else {
    creditNoteNumber = `GS-${Date.now()}`;
  }

  const { renderToBuffer } = await import('@react-pdf/renderer');
  const { InvoiceDocument } = await import('./src/components/pdf/invoice');
  const logoBase64 = undefined;

  pdfBuffer = await renderToBuffer(
    React.createElement(InvoiceDocument, {
      invoiceNumber: creditNoteNumber,
      date: new Date(),
      dueDate: new Date(),
      orderNumber: order.marketplaceOrderId,
      orderDate: order.marketplacePurchaseDate || undefined,
      customerNumber: order.customerNumber || '–',
      company: {
        name: company.legalName || company.name,
        street: company.street || undefined,
        zip: company.zip || undefined,
        city: company.city || undefined,
        country: company.country,
        email: company.email || undefined,
        logoUrl: logoBase64 || undefined,
      },
      recipient: {
        name: originalInvoice.recipientName,
        street: originalInvoice.recipientStreet || '',
        zip: originalInvoice.recipientZip || '',
        city: originalInvoice.recipientCity || '',
        country: originalInvoice.recipientCountry || 'DE',
      },
      items: creditNoteItems,
      currency: order.currency,
      paymentMethod: 'Marketplace',
      isCreditNote: true,
      documentType: 'invoice',
      cancelsInvoiceNumber: originalInvoice.invoiceNumber,
      cancelsInvoiceDate: originalInvoice.createdAt || undefined,
    }) as any
  );

  const storageKey = buildInvoiceKey(companyId, creditNoteNumber);
  await uploadDocument(storageKey, pdfBuffer);

  await db.transaction(async (tx) => {
    const [dbCompany] = await tx.select().from(companies).where(eq(companies.id, companyId)).for('update');
    if (dbCompany) {
      const currentSettings = dbCompany.documentNumberSettings as any || {};
      const config = currentSettings.creditNote || getDefaultSettings('creditNote', dbCompany);
      if (config && config.auto) {
        const nextNum = parseInt(config.next, 10) || 1;
        await tx.update(companies)
          .set({ documentNumberSettings: { ...currentSettings, creditNote: { ...config, next: (nextNum + 1).toString() } }, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      }
    }

    const [newCreditNoteInvoice] = await tx.insert(invoices).values({
      companyId,
      invoiceNumber: creditNoteNumber,
      status: 'issued',
      documentType: 'invoice',
      recipientName: originalInvoice.recipientName,
      recipientStreet: originalInvoice.recipientStreet,
      recipientZip: originalInvoice.recipientZip,
      recipientCity: originalInvoice.recipientCity,
      recipientCountry: originalInvoice.recipientCountry,
      recipientEmail: originalInvoice.recipientEmail,
      currency: order.currency || 'EUR',
      subtotalAmount: subtotalAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      taxRate: (taxAmount / subtotalAmount || 0).toFixed(4),
      isCreditNote: true,
      cancelsInvoiceId: originalInvoice.id,
      dueAt: new Date(),
      pdfStorageKey: storageKey,
      pdfGeneratedAt: new Date(),
      issuedAt: new Date()
    }).returning({ id: invoices.id });

    newCreditNoteInvoiceId = newCreditNoteInvoice.id;

    await tx.insert(invoiceItems).values(
      creditNoteItems.map((item, index) => ({
        invoiceId: newCreditNoteInvoice.id,
        companyId,
        position: (index + 1).toString(),
        sku: item.sku,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toFixed(2),
        taxRate: item.taxRate.toString(),
        lineTotal: (item.unitPrice * item.quantity).toFixed(2),
      }))
    );

    const existingMetadata = (returnEntry.metadata as Record<string, any>) || {};
    await tx.update(returnsLog)
      .set({
        metadata: {
          ...existingMetadata,
          creditNoteId: newCreditNoteInvoice.id,
          refundedItems: itemsToRefund
        }
      })
      .where(eq(returnsLog.id, returnEntry.id));
  });

  console.log(`  -> Generated credit note ${creditNoteNumber} successfully.`);
  return true;
}

async function main() {
  console.log('Fetching returns log...');
  const allReturns = await db.query.returnsLog.findMany({
    with: { items: true }
  });

  const targetReturns = allReturns.filter(r => {
    const marketplace = (r.marketplace || '').toLowerCase();
    if (marketplace.includes('otto')) return false;
    if (marketplace.includes('limango') || marketplace.includes('mirakl') || marketplace.includes('decathlon') || marketplace.includes('secret sales')) return false;
    if (marketplace.includes('about')) return false;
    if (marketplace.includes('zalando')) return false;
    
    const meta = r.metadata as any;
    return !meta || !meta.creditNoteId;
  });

  console.log(`Found ${targetReturns.length} returns for Amazon, Kaufland, eBay, Shopify, Shopware, WooCommerce needing a credit note.`);

  let successCount = 0;
  for (const ret of targetReturns) {
    console.log(`Processing return ${ret.id} for order ${ret.orderNumber} (Marketplace: ${ret.marketplace})...`);
    
    if (!ret.orderId) {
      console.warn(`  -> No orderId linked.`);
      continue;
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, ret.orderId),
      with: { items: true }
    });

    if (!order) {
      console.warn(`  -> Order not found in DB.`);
      continue;
    }

    const itemsToRefund = ret.items.map(i => ({
      sku: i.skuOrProductName,
      quantity: i.quantity
    }));

    try {
      const success = await generateCreditNoteForReturn(ret, ret.companyId, order, itemsToRefund);
      if (success) successCount++;
    } catch (e) {
      console.error(`  -> Error:`, e);
    }
  }

  console.log(`Finished generating credit notes. Successfully processed ${successCount} out of ${targetReturns.length}.`);
  process.exit(0);
}

main().catch(console.error);
