import pg from 'pg';

const db_url = "postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const pool = new pg.Pool({ connectionString: db_url });
  const client = await pool.connect();

  const res = await client.query(`
    SELECT company_id, count(*) 
    FROM orders 
    WHERE is_archived = false AND status != 'draft' 
    GROUP BY company_id 
    ORDER BY count(*) DESC 
    LIMIT 1
  `);
  if (res.rows.length === 0) return;
  const company_id = res.rows[0].company_id;

  const ordersRes = await client.query(`
    SELECT id, invoice_id, raw_payload FROM orders 
    WHERE company_id = $1 
    AND is_archived = false 
    AND status != 'draft'
  `, [company_id]);

  const optimizedOrders = ordersRes.rows.map(order => {
    const raw = order.raw_payload;
    let strippedPayload = null;
    if (raw) {
      strippedPayload = {
        orderNumber: raw.orderNumber,
        financial_status: raw.financial_status,
        manualBillingAddress: raw.manualBillingAddress,
        invoiceAddress: raw.invoiceAddress,
        customer: raw.customer ? { billing_address: raw.customer.billing_address } : undefined,
        billing_street: raw.billing_street,
        billing_zip_code: raw.billing_zip_code,
        billing_city: raw.billing_city,
        billing_country_code: raw.billing_country_code,
      };
    }
    return {
      ...order,
      raw_payload: strippedPayload
    };
  });

  const jsonStr = JSON.stringify(optimizedOrders);
  console.log(`Optimized orders JSON string length: ${jsonStr.length} bytes (${(jsonStr.length / 1024 / 1024).toFixed(2)} MB)`);
  client.release();
  await pool.end();
}

main().catch(console.error);
