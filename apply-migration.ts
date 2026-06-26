import { db } from './src/db/client';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function run() {
  try {
    const migrationSql = fs.readFileSync('./src/db/migrations/0021_mature_shape.sql', 'utf8');
    const statements = migrationSql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
    
    for (const statement of statements) {
      console.log('Executing:', statement);
      await db.execute(sql.raw(statement));
    }
    console.log('Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
run();
