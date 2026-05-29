const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const res = await sql`
      SELECT 
        i.id,
        i.invoice_number,
        i.status,
        i.recipient_name,
        i.recipient_country,
        i.total_amount,
        i.currency,
        i.created_at,
        i.pdf_storage_key,
        o.marketplace,
        i.cancels_invoice_id,
        i.is_credit_note,
        i.document_type
      FROM invoices i
      LEFT JOIN orders o ON i.id = o.invoice_id
      WHERE i.company_id = 'e7d4d45d-752a-4a6c-b4b9-fa63cf4cbf03'
        AND i.document_type = 'invoice'
        AND i.status != 'draft'
      ORDER BY i.created_at DESC
      LIMIT 10
    `;
    console.log('Query result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Query failed:', err);
  } finally {
    await sql.end();
  }
}

main();
