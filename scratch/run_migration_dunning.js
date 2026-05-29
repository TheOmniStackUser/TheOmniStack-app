// Migration script: add paid_at column to invoices and create dunning tables
const postgres = require('postgres');

const DATABASE_URL = 'postgresql://neondb_owner:npg_iYQt4xBdqH5l@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function migrate() {
  const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });
  
  try {
    console.log('Running migration: add paid_at and create dunning enums/tables...');

    // 1. Alter invoices table
    console.log('Altering invoices table...');
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;`;
    console.log('✓ invoices.paid_at column added (or already existed)');

    // 2. Create dunning_stage enum
    console.log('Creating dunning_stage enum if not exists...');
    await sql`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dunning_stage') THEN
              CREATE TYPE dunning_stage AS ENUM ('reminder', 'first', 'second');
          END IF;
      END$$;
    `;
    console.log('✓ dunning_stage enum ready');

    // 3. Create dunning_status enum
    console.log('Creating dunning_status enum if not exists...');
    await sql`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dunning_status') THEN
              CREATE TYPE dunning_status AS ENUM ('sent', 'failed', 'skipped');
          END IF;
      END$$;
    `;
    console.log('✓ dunning_status enum ready');

    // 4. Create dunning_rules table
    console.log('Creating dunning_rules table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dunning_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        stage dunning_stage NOT NULL,
        is_enabled boolean NOT NULL DEFAULT false,
        days_after_due integer NOT NULL DEFAULT 0,
        subject_template text NOT NULL DEFAULT '',
        body_template text NOT NULL DEFAULT '',
        fee_amount numeric(8, 2),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✓ dunning_rules table ready');

    // 5. Create dunning_logs table
    console.log('Creating dunning_logs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dunning_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        stage dunning_stage NOT NULL,
        status dunning_status NOT NULL DEFAULT 'sent',
        recipient_email text NOT NULL,
        subject text NOT NULL DEFAULT '',
        error_message text,
        sent_at timestamp with time zone NOT NULL DEFAULT now(),
        triggered_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
      );
    `;
    console.log('✓ dunning_logs table ready');

    // 6. Create dunning_exclusions table
    console.log('Creating dunning_exclusions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dunning_exclusions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        recipient_email text NOT NULL,
        reason text,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✓ dunning_exclusions table ready');

    console.log('\n✅ Database migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
