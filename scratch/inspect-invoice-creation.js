const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  const [invoice] = await sql`
    SELECT i.id, i.invoice_number, i.created_at, i.issued_at, i.pdf_storage_key
    FROM invoices i
    JOIN orders o ON o.invoice_id = i.id
    WHERE o.marketplace_order_id = '583b1448-78d5-4c47-86fe-51a53e9b461e'
  `;
  console.log("Invoice for cbn4xt6sjv:");
  console.log(JSON.stringify(invoice, null, 2));

  console.log("\nRecent invoices:");
  const recentInvoices = await sql`
    SELECT id, invoice_number, created_at, pdf_storage_key
    FROM invoices
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log(JSON.stringify(recentInvoices, null, 2));
}

main().catch(console.error).finally(() => sql.end());
