import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function run() {
  const marketplaces = await sql`
    SELECT marketplace, count(*)::int 
    FROM orders 
    GROUP BY marketplace
  `;
  console.log("MARKETPLACES IN ORDERS:");
  console.log(marketplaces);

  const invoiceStats = await sql`
    SELECT o.marketplace, i.status, (i.paid_at IS NULL) as paid_at_null, count(*)::int
    FROM invoices i
    LEFT JOIN orders o ON i.id = o.invoice_id
    GROUP BY o.marketplace, i.status, (i.paid_at IS NULL)
  `;
  console.log("\nINVOICE STATS:");
  console.log(invoiceStats);
}

run()
  .catch(console.error)
  .then(async () => {
    await sql.end();
    process.exit(0);
  });
