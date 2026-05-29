const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const orders = await sql`
      SELECT id, marketplace, "marketplace_order_id", "invoice_id", "status", "shipping_country", "buyer_name", "created_at"
      FROM orders
      WHERE "invoice_id" IS NOT NULL
      ORDER BY "created_at" DESC
      LIMIT 10
    `;
    console.log('Orders WITH invoice:', JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
