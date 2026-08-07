require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');
const fs = require('fs');

async function run() {
  const sqlClient = postgres(process.env.DATABASE_URL, { ssl: 'require' });
  
  const sql = fs.readFileSync('src/db/migrations/0032_fast_skullbuster.sql', 'utf8');
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
  
  for (const statement of statements) {
    console.log('Executing:', statement);
    await sqlClient.unsafe(statement);
  }
  
  await sqlClient.end();
  console.log('Migration completed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
