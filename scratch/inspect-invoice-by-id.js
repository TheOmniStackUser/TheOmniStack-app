const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const invoice = await sql`
      SELECT *
      FROM invoices
      WHERE id = '3b3b54ea-7f24-489a-b633-ee805fc8c1ae'
    `;
    console.log('Invoice for BE5KGTV9ERWP-A:', JSON.stringify(invoice, null, 2));

    const invoiceItems = await sql`
      SELECT *
      FROM invoice_items
      WHERE invoice_id = '3b3b54ea-7f24-489a-b633-ee805fc8c1ae'
    `;
    console.log('Invoice items for BE5KGTV9ERWP-A:', JSON.stringify(invoiceItems, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
