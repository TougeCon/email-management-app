import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

// Use DATABASE_PUBLIC_URL (external) first for Railway, fall back to DATABASE_URL (internal)
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

function initializeDb(): PostgresJsDatabase<typeof schema> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL must be set");
  }

  if (!dbInstance) {
    // Check if using pgbouncer (Supabase/Railway) - disable prepared statements
    const isPgbouncer = databaseUrl.includes("pgbouncer") || databaseUrl.includes(":6543");

    clientInstance = globalForDb.client ?? postgres(databaseUrl, {
      prepare: isPgbouncer ? false : undefined,
      ssl: databaseUrl.includes("localhost") ? "prefer" : "require",
      max: isPgbouncer ? 1 : undefined,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    dbInstance = drizzle(clientInstance, { schema });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.db = dbInstance;
      globalForDb.client = clientInstance;
    }
  }

  return dbInstance;
}

// Export db as a Proxy for lazy initialization
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop: string) {
    const actualDb = initializeDb();
    // Use Reflect.get to properly access properties
    return Reflect.get(actualDb, prop);
  },
});

export type Database = PostgresJsDatabase<typeof schema>;