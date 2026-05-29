const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const vat = await sql`
      SELECT *
      FROM vat_settings
      WHERE company_id = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
    `;
    console.log('VAT settings:', JSON.stringify(vat, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
