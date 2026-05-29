const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const integrations = await sql`
      SELECT *
      FROM marketplace_integrations
      WHERE id = 'b8099021-7d7d-4dfa-9b24-5383b5e2ba0b'
    `;
    console.log('Decathlon CZ integration:', JSON.stringify(integrations, null, 2));

    const orderItems = await sql`
      SELECT *
      FROM order_items
      WHERE order_id = '6dcac5b8-6d44-4fc4-beba-6f0ec54d3e58'
    `;
    console.log('Order items for cz2882073661-A:', JSON.stringify(orderItems, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
