require('dotenv').config();
const postgres = require('postgres');
async function run() {
  const sql = postgres({
    host: process.env.NEON_HOST || 'ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech',
    port: 5432,
    database: process.env.NEON_DB || 'neondb',
    username: process.env.NEON_USER || 'neondb_owner',
    password: process.env.NEON_PASSWORD,
    ssl: 'require'
  });
  const res = await sql`SELECT id, environment FROM marketplace_integrations WHERE type = 'ebay' AND is_active = true`;
  console.log('Integrations:', res);
  await sql.end();
}
run();
