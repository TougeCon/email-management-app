import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres:0BOyDjTlxVcALRKJ@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=strict";

async function runMigration() {
  console.log("Running chat_history table migration...");

  const sql = postgres(DATABASE_URL, {
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✓ chat_history table created successfully");

    await sql.end();
    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    await sql.end();
    process.exit(1);
  }
}

runMigration();
