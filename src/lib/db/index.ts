import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

// Use DATABASE_URL (internal) for Railway container connections
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

let client: ReturnType<typeof postgres> | undefined;
let db: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL must be set");
    }

    client = globalForDb.client ?? postgres(databaseUrl, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    db = drizzle(client, { schema });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.db = db;
      globalForDb.client = client;
    }
  }
  return db;
}

export { getDb as db };
export type Database = PostgresJsDatabase<typeof schema>;