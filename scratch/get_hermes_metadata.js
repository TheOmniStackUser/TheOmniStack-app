const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require',
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT metadata FROM marketplace_integrations WHERE type = 'hermes' LIMIT 1;");
  if (res.rows.length > 0) {
    console.log(JSON.stringify(res.rows[0].metadata, null, 2));
  } else {
    console.log('Keine Hermes Integration gefunden.');
  }
  await client.end();
}

run().catch(console.error);
