import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

// Use DATABASE_URL (internal) for Railway container connections
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

function createClient() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL must be set");
  }
  return postgres(databaseUrl, {
    prepare: false,
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Get or create the database connection
function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.db) {
    const client = globalForDb.client ?? createClient();
    globalForDb.client = client;
    globalForDb.db = drizzle(client, { schema });
  }
  return globalForDb.db;
}

// Export as db for backward compatibility
// This will throw if used before db is initialized
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    const actualDb = getDb();
    return (actualDb as Record<string, unknown>)[prop as string];
  },
});

export type Database = PostgresJsDatabase<typeof schema>;