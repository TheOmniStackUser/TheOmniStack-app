const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const logs = await sql`
      SELECT *
      FROM invoice_logs
      ORDER BY created_at DESC
      LIMIT 30
    `;
    console.log('Invoice logs:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
