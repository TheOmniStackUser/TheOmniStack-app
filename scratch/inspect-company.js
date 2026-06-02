const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const company = await sql`
      SELECT id, name, legal_name, vat_id, tax_id, street, zip, city, country
      FROM companies
    `;
    console.log('All Companies:', JSON.stringify(company, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
