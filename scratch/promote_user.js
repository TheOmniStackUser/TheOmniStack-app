const postgres = require('postgres');

async function makeSuperUser() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set in environment.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { ssl: 'require' });
  const email = 'leis@guggen-mountain.com';
  
  console.log(`Setting is_super_admin=true for ${email} using raw SQL...`);
  
  const result = await sql`
    UPDATE users 
    SET is_super_admin = true 
    WHERE email = ${email}
    RETURNING id, email, is_super_admin;
  `;

  if (result.length > 0) {
    console.log('Success! User is now a Superuser.');
    console.log(result[0]);
  } else {
    console.log('User not found. Please check if the user has already registered with this email.');
  }

  await sql.end();
}

makeSuperUser().catch(console.error);
