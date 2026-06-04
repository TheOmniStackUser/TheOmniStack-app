const postgres = require('postgres');
const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const invoice = await sql`
      SELECT *
      FROM invoices
      WHERE invoice_number = 'GS-202640000'
    `;
    console.log('Invoice:', JSON.stringify(invoice, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}
main();
