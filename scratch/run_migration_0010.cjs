// Migration script: add woocommerce + shopware enum values
const postgres = require('postgres')

const DATABASE_URL = 'postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'

async function migrate() {
  const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 })
  
  try {
    console.log('Running migration: add woocommerce + shopware enum values...')

    // PostgreSQL requires each ALTER TYPE in a separate transaction
    await sql`ALTER TYPE "integration_type" ADD VALUE IF NOT EXISTS 'woocommerce'`
    console.log('✓ integration_type: woocommerce added')

    await sql`ALTER TYPE "integration_type" ADD VALUE IF NOT EXISTS 'shopware'`
    console.log('✓ integration_type: shopware added')

    await sql`ALTER TYPE "marketplace" ADD VALUE IF NOT EXISTS 'woocommerce'`
    console.log('✓ marketplace: woocommerce added')

    await sql`ALTER TYPE "marketplace" ADD VALUE IF NOT EXISTS 'shopware'`
    console.log('✓ marketplace: shopware added')

    console.log('\n✅ Migration 0010_add_woocommerce_shopware completed successfully!')
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

migrate()
