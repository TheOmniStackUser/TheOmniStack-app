"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const invoice_service_1 = require("../src/lib/invoice-service");
const client_1 = require("../src/db/client");
const orders_1 = require("../src/db/schema/orders");
const drizzle_orm_1 = require("drizzle-orm");
async function main() {
    try {
        const [order] = await client_1.db.select().from(orders_1.orders).where((0, drizzle_orm_1.eq)(orders_1.orders.marketplaceOrderId, 'cz2882073661-A')).limit(1);
        if (!order) {
            console.log('Order cz2882073661-A not found');
            return;
        }
        console.log('Order found:', order);
        const result = await (0, invoice_service_1.createInvoiceForOrder)(order.id, order.companyId);
        console.log('Invoice generation result:', result);
    }
    catch (err) {
        console.error('Invoice generation failed with error:', err);
    }
    finally {
        process.exit(0);
    }
}
main();
