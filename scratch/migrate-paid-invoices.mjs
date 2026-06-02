import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function run() {
  // 1. Find all issued, unpaid invoices from payment-handling marketplaces
  const candidateInvoices = await sql`
    SELECT i.id, i.invoice_number, o.marketplace, i.issued_at, i.created_at, o.raw_payload->>'financial_status' as shopify_status
    FROM invoices i
    LEFT JOIN orders o ON i.id = o.invoice_id
    WHERE i.status = 'issued'
      AND i.paid_at IS NULL
      AND i.is_credit_note = false
      AND o.marketplace IS NOT NULL
  `;

  console.log(`Found ${candidateInvoices.length} total issued, unpaid invoices linked to marketplace orders.`);

  const toUpdate = [];
  for (const inv of candidateInvoices) {
    const mp = inv.marketplace.toLowerCase();
    
    // Shopify orders must be checked for 'paid' status
    if (mp === 'shopify') {
      if (inv.shopify_status === 'paid') {
        toUpdate.push(inv);
      }
    } 
    // Manual, WooCommerce, Shopware are not auto-paid
    else if (mp !== 'manual' && mp !== 'woocommerce' && mp !== 'shopware') {
      toUpdate.push(inv);
    }
  }

  console.log(`Of those, ${toUpdate.length} should be marked as paid (marketplace handles payment or shopify is paid).`);

  if (toUpdate.length > 0) {
    console.log("Updating invoices in database...");
    
    // Perform update in chunks or loop (since it's a small migration script)
    let updatedCount = 0;
    for (const inv of toUpdate) {
      const paymentDate = inv.issued_at || inv.created_at || new Date();
      await sql`
        UPDATE invoices
        SET paid_at = ${paymentDate}
        WHERE id = ${inv.id}
      `;
      updatedCount++;
    }
    console.log(`Successfully updated ${updatedCount} invoices.`);
  } else {
    console.log("No invoices need update.");
  }
}

run()
  .catch(console.error)
  .then(async () => {
    await sql.end();
    process.exit(0);
  });
