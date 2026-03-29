import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
};

// Use DATABASE_PUBLIC_URL for Railway external connections, fall back to DATABASE_URL
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export const db =
  globalForDb.db ??
  drizzle(
    postgres(databaseUrl, {
      prepare: false,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    }),
    { schema }
  );

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type Database = typeof db;