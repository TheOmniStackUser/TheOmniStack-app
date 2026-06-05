import postgres from 'postgres'

const connectionString = "postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"

const sql = postgres(connectionString, { max: 1 })

async function main() {
  console.log('Running direct SQL ENUM updates...');
  
  const values = ['aboutyou', 'kaufland', 'ebay', 'woocommerce', 'shopware', 'mirakl_custom'];
  for (const v of values) {
    try {
      await sql.unsafe(`ALTER TYPE marketplace ADD VALUE IF NOT EXISTS '${v}';`);
      console.log(`Added ${v}`);
    } catch(e) {
      console.error(`Failed to add ${v}:`, e.message);
    }
  }

  console.log('SQL complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
