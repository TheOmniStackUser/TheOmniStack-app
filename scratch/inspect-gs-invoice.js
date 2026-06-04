const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

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
