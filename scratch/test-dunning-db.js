const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    const rules = await sql`SELECT * FROM dunning_rules LIMIT 1`;
    console.log('dunning_rules table exists! Data:', rules);
  } catch (err) {
    console.error('Error querying dunning_rules:', err.message);
  }

  try {
    const logs = await sql`SELECT * FROM dunning_logs LIMIT 1`;
    console.log('dunning_logs table exists! Data:', logs);
  } catch (err) {
    console.error('Error querying dunning_logs:', err.message);
  }

  try {
    const exclusions = await sql`SELECT * FROM dunning_exclusions LIMIT 1`;
    console.log('dunning_exclusions table exists! Data:', exclusions);
  } catch (err) {
    console.error('Error querying dunning_exclusions:', err.message);
  }

  await sql.end();
}

main();
