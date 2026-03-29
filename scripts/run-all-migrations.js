import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set");
  console.error("Please set it in your .env file or run: export DATABASE_URL=your-connection-string");
  process.exit(1);
}

async function runMigrations() {
  console.log("Running database migrations...\n");
  console.log(`Connecting to database...\n`);

  const sql = postgres(DATABASE_URL, {
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    // Check if chat_history table exists
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chat_history'
      );
    `;

    if (result[0].exists) {
      console.log("✓ chat_history table already exists");
    } else {
      await sql.unsafe(`
        CREATE TABLE chat_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log("✓ chat_history table created");
    }

    // Check for missing indexes on email_cache
    console.log("Checking indexes...");

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_cache_account_id ON email_cache(account_id);
    `);
    console.log("✓ idx_email_cache_account_id");

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_cache_received_at ON email_cache(received_at);
    `);
    console.log("✓ idx_email_cache_received_at");

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_cache_sender_email ON email_cache(sender_email);
    `);
    console.log("✓ idx_email_cache_sender_email");

    // Check for body_preview column
    const columnCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'email_cache'
        AND column_name = 'body_preview'
      );
    `;

    if (!columnCheck[0].exists) {
      await sql.unsafe(`ALTER TABLE email_cache ADD COLUMN body_preview TEXT;`);
      console.log("✓ body_preview column added to email_cache");
    } else {
      console.log("✓ body_preview column already exists");
    }

    // Check is_spam column
    const isSpamCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'email_cache'
        AND column_name = 'is_spam'
      );
    `;

    if (!isSpamCheck[0].exists) {
      await sql.unsafe(`ALTER TABLE email_cache ADD COLUMN is_spam BOOLEAN DEFAULT FALSE;`);
      console.log("✓ is_spam column added to email_cache");
    } else {
      console.log("✓ is_spam column already exists");
    }

    console.log("\n✓ All migrations completed successfully!");
  } catch (error) {
    console.error("\n✗ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
