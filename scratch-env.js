const postgres = require('postgres');
async function run() {
  const sql = postgres({
    host: 'ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech',
    port: 5432,
    database: 'neondb',
    username: 'neondb_owner',
    password: '!ha1860a81234CVs$%',
    ssl: 'require'
  });
  const res = await sql`SELECT id, environment FROM marketplace_integrations WHERE type = 'ebay' AND is_active = true`;
  console.log('Integrations:', res);
  await sql.end();
}
run();
