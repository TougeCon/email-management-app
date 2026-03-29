import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

// Use DATABASE_URL for internal Railway connections, fall back to DATABASE_PUBLIC_URL
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";

function createClient() {
  return postgres(databaseUrl, {
    prepare: false,
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Lazy initialization - only connect when db is first used
let _db: PostgresJsDatabase<typeof schema> | undefined;
let _client: ReturnType<typeof postgres> | undefined;

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(target, prop) {
    if (!_db) {
      _client = globalForDb.client ?? createClient();
      _db = drizzle(_client, { schema });
      if (process.env.NODE_ENV !== "production") {
        globalForDb.db = _db;
        globalForDb.client = _client;
      }
    }
    return Reflect.get(_db, prop);
  },
});

export type Database = typeof db;