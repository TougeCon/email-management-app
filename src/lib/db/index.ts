import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

// Use DATABASE_URL (internal) for Railway container connections
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

function initializeDb() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL must be set");
  }

  if (!dbInstance) {
    clientInstance = globalForDb.client ?? postgres(databaseUrl, {
      prepare: false,
      ssl: "require",
      max: 1,
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

// Export db that initializes on first property access
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const db = initializeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (db as any)[prop];
  },
});

export type Database = PostgresJsDatabase<typeof schema>;