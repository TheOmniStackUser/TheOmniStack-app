const { db } = require('@vercel/postgres');

async function run() {
  const client = await db.connect();
  const res = await client.query(`
    SELECT r.id, r.order_number, r.status, r.notes, r.metadata, r.created_at
    FROM returns_log r
    WHERE r.order_number = 'DE5KF9V9GD5E'
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  client.release();
}
run().catch(console.error);
