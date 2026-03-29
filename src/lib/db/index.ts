import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  db: PostgresJsDatabase<typeof schema> | undefined;
};

export const db =
  globalForDb.db ??
  drizzle(
    postgres(process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder", {
      prepare: false,
    }),
    { schema }
  );

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type Database = typeof db;