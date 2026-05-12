import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// ─── Connection Pool ──────────────────────────────────────────────────────────
// Uses a singleton to avoid exhausting connections during Next.js hot reloads
const globalForDb = globalThis as unknown as { _pgClient: postgres.Sql | undefined }

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/build-placeholder'

// In development, reuse the connection across hot reloads
const client =
  globalForDb._pgClient ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client
}

export const db = drizzle(client, { schema })
export type Database = typeof db
