import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'

async function run() {
  const marketplaces = ['otto', 'decathlon_de', 'shopify', 'shopware', 'woocommerce'];
  
  for (const mp of marketplaces) {
    const orderList = await db.query.orders.findMany({
      where: (orders, { eq, like }) => like(orders.marketplace, mp === 'decathlon_de' ? 'mirakl_%' : mp),
      limit: 1
    })
    if (orderList.length > 0) {
      console.log(`\n--- ${mp} ---`);
      const raw = orderList[0].rawPayload as any;
      console.log("Customer / Buyer payload:", JSON.stringify(raw.customer || raw.invoiceAddress || raw.billing_address || raw.billing || raw.billingAddress, null, 2));
      console.log("Delivery / Shipping payload:", JSON.stringify(raw.deliveryAddress || raw.shipping_address || raw.shipping || raw.deliveries?.[0]?.shippingOrderAddress, null, 2));
    }
  }
  process.exit(0)
}
run().catch(console.error)
