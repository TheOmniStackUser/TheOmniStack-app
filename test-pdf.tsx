import { renderToBuffer } from '@react-pdf/renderer';
import { DeliveryNoteDocument } from './src/components/pdf/delivery-note';
import { db } from './src/db/client';
import { orders, orderItems } from './src/db/schema/orders';
import { companies } from './src/db/schema/companies';
import { eq } from 'drizzle-orm';
import React from 'react';

async function run() {
  const [order] = await db.select().from(orders).where(eq(orders.id, 'c38e5782-3a36-4d81-82fa-da854d960c9e'));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const [company] = await db.select().from(companies).where(eq(companies.id, order.companyId));
  
  const orderWithItems = { ...order, items };
  
  console.log("Rendering PDF...");
  try {
    const buffer = await renderToBuffer(<DeliveryNoteDocument order={orderWithItems} company={company} />);
    console.log("Success! Buffer size:", buffer.length);
  } catch (err) {
    console.error("Error rendering:", err);
  }
  process.exit(0);
}
run();
