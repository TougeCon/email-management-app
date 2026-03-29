// Script to reset the password in the database
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function resetPassword() {
  const bcrypt = require('bcryptjs');

  const password = 'changeme123';
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('Generated hash:', passwordHash);

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check existing config
    const existing = await client.query('SELECT * FROM app_config LIMIT 1');
    console.log('Existing config:', existing.rows);

    // Update password
    const result = await client.query(
      'UPDATE app_config SET password_hash = $1 WHERE id = (SELECT id FROM app_config LIMIT 1)',
      [passwordHash]
    );

    console.log('Updated rows:', result.rowCount);

    // Verify
    const verify = await client.query('SELECT password_hash FROM app_config LIMIT 1');
    console.log('New hash:', verify.rows[0]?.password_hash);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

resetPassword();
