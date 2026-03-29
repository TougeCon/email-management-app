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

# Groq AI Integration (https://console.groq.com)
AI_API_URL=https://api.groq.com/openai/v1/chat/completions
AI_API_KEY=
AI_MODEL=llama3-8b-8192

# Database (Railway PostgreSQL or local)
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
console.log('1. Set DATABASE_URL to your PostgreSQL connection string (Railway or local)');
console.log('2. Add your OAuth credentials for Gmail/Outlook');
console.log('3. Set AI_API_KEY from https://console.groq.com for AI features');
console.log('4. Run: npm run db:push');
console.log('5. Run: npm run dev');
