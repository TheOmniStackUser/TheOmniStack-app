const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const logs = await sql`
      SELECT *
      FROM invoice_logs
      WHERE company_id = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    console.log('Invoice logs for target company:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
