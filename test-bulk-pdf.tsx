import { renderToStream } from '@react-pdf/renderer';
import { DeliveryNoteDocument } from './src/components/pdf/delivery-note';
import { db } from './src/db/client';
import { orders, orderItems } from './src/db/schema/orders';
import { companies } from './src/db/schema/companies';
import { inArray } from 'drizzle-orm';
import React from 'react';
import { PDFDocument } from 'pdf-lib';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (err) => reject(err))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function run() {
  const ids = ['c38e5782-3a36-4d81-82fa-da854d960c9e', 'b826afdc-a356-404c-82cd-f680ee36c182'];
  const dbOrders = await db.select().from(orders).where(inArray(orders.id, ids));
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, ids));
  const [company] = await db.select().from(companies).where(inArray(companies.id, dbOrders.map(o => o.companyId)));
  
  const pdfBuffers = [];
  for (const order of dbOrders) {
    const orderItemsForOrder = items.filter(i => i.orderId === order.id).map(i => ({ ...i, quantity: parseInt(i.quantity) }));
    const orderWithItems = { ...order, items: orderItemsForOrder };
    
    console.log("Rendering PDF for", order.id);
    const stream = await renderToStream(<DeliveryNoteDocument order={orderWithItems} company={company} />);
    const pdfBuffer = await streamToBuffer(stream as any);
    pdfBuffers.push(pdfBuffer);
  }

  const mergedPdf = await PDFDocument.create();
  for (const buffer of pdfBuffers) {
    const srcPdf = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const mergedPdfBytes = await mergedPdf.save();
  console.log("Success! Bulk Buffer size:", mergedPdfBytes.length);
  process.exit(0);
}
run();
