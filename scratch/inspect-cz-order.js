const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const orders = await sql`
      SELECT *
      FROM orders
      WHERE id = '6dcac5b8-6d44-4fc4-beba-6f0ec54d3e58'
    `;
    console.log('Order Details:', JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
