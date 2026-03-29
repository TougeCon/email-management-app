// Run this script to generate a .env file with random secrets
// Usage: node setup-env.js

const crypto = require('crypto');

function generateHex(length) {
  return crypto.randomBytes(length).toString('hex');
}

console.log('Generating secure random keys...\n');

const envContent = `# App Security
APP_PASSWORD_HASH=
ENCRYPTION_KEY=${generateHex(32)}
NEXTAUTH_SECRET=${generateHex(32)}

# Gmail OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=

# Microsoft OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=

# Ollama AI Integration
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Database
DATABASE_URL=

# App URL (change for production)
NEXTAUTH_URL=http://localhost:3000
`;

const fs = require('fs');
fs.writeFileSync('.env', envContent);

console.log('Created .env file with:');
console.log(`  - ENCRYPTION_KEY: ${generateHex(32).substring(0, 16)}...`);
console.log(`  - NEXTAUTH_SECRET: ${generateHex(32).substring(0, 16)}...`);
console.log('\nNext steps:');
console.log('1. Set DATABASE_URL to your Supabase connection string');
console.log('2. Add your OAuth credentials (or use localhost:3000 for testing without OAuth)');
console.log('3. Run: npm run db:push');
console.log('4. Run: npm run dev');
