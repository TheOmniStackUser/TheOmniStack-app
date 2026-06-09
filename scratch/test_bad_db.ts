import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const badClient = postgres('postgres://baduser:badpass@localhost:5432/baddb', { max: 1, connect_timeout: 1 });
  const badDb = drizzle(badClient, { schema });
  
  try {
    await badDb.select({ id: schema.companies.id }).from(schema.companies).limit(1);
    console.log("Success");
  } catch (err) {
    console.log("Caught Error:");
    console.log(err.message);
    if (err.cause) console.log("Cause:", err.cause.message);
  }
  process.exit(0);
}

main().catch(console.error);
