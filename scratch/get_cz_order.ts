import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const res = await pool.query(`
    SELECT marketplace_order_id, raw_payload, created_at
    FROM orders
    WHERE marketplace ILIKE '%decathlon cz%'
    ORDER BY created_at DESC
    LIMIT 3;
  `);
  for (const row of res.rows) {
    console.log("Order:", row.marketplace_order_id);
    const channel = row.raw_payload?.channel;
    console.log("Channel:", channel);
    const shipping = row.raw_payload?.customer?.shipping_address;
    console.log("Shipping Country:", shipping?.country, shipping?.country_iso_code);
  }
  pool.end();
}
run();
