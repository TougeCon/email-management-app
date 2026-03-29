const postgres = require("postgres");

async function test() {
  console.log("Testing database connection...");
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "not set");
  console.log("DATABASE_PUBLIC_URL:", process.env.DATABASE_PUBLIC_URL ? "set" : "not set");

  const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("No database URL found");
    process.exit(1);
  }

  try {
    const sql = postgres(url, { ssl: false, max: 1, connect_timeout: 10 });
    const result = await sql`SELECT 1 as test`;
    console.log("Connection successful:", result);

    // Create tables
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS app_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS email_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider TEXT NOT NULL,
        email_address TEXT NOT NULL UNIQUE,
        display_name TEXT,
        encrypted_access_token TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        token_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        last_synced_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS account_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS account_group_members (
        group_id UUID REFERENCES account_groups(id) ON DELETE CASCADE,
        account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS email_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
        provider_email_id TEXT NOT NULL,
        subject TEXT,
        sender TEXT,
        sender_email TEXT,
        received_at TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE,
        folder TEXT,
        labels JSONB,
        snippet TEXT,
        is_spam BOOLEAN DEFAULT FALSE,
        cached_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cleanup_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        conditions JSONB NOT NULL,
        action TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS deletion_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
        provider_email_id TEXT NOT NULL,
        subject TEXT,
        sender TEXT,
        deleted_at TIMESTAMP DEFAULT NOW(),
        restore_before TIMESTAMP NOT NULL,
        action TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sender_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_email_pattern TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_cache_account_id ON email_cache(account_id);
      CREATE INDEX IF NOT EXISTS idx_email_cache_received_at ON email_cache(received_at);
      CREATE INDEX IF NOT EXISTS idx_email_cache_sender_email ON email_cache(sender_email);
    `);
    console.log("Tables created successfully!");

    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

test();