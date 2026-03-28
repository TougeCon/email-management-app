# Email Management App

A secure web application for managing multiple email accounts, with AI-powered search and bulk spam cleanup.

## Features

- **Multi-Account Support**: Connect Gmail, Outlook/Hotmail, and AOL accounts
- **Cross-Account Search**: Search across all your emails from one interface
- **AI-Powered Assistant**: Use natural language to find and manage emails (Ollama/GLM5)
- **Bulk Spam Cleanup**: Delete or archive multiple emails at once
- **Cleanup Rules**: Create automatic rules to process incoming emails
- **Account Groups**: Organize accounts into groups for easier searching
- **Undo Queue**: Restore deleted emails within 24 hours

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Password-protected single-user access
- **AI**: Ollama with GLM5 model

## Prerequisites

1. **Node.js** 20+
2. **PostgreSQL** database
3. **Ollama** (for AI features) - optional
4. **OAuth Credentials**:
   - Google Cloud Console (for Gmail)
   - Microsoft Azure Portal (for Outlook)
   - AOL App Password (for AOL)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `APP_PASSWORD_HASH` - bcrypt hash of your chosen password
- `ENCRYPTION_KEY` - 32-byte random string (64 hex characters)
- `NEXTAUTH_SECRET` - Random string for session encryption
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` - Gmail OAuth
- `MICROSOFT_CLIENT_ID` & `MICROSOFT_CLIENT_SECRET` - Outlook OAuth
- `OLLAMA_API_URL` - Ollama endpoint (default: http://localhost:11434)
- `NEXTAUTH_URL` - Your app URL (http://localhost:3000 for dev)

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate NextAuth secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set Up Database

```bash
npm run db:push
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. First-Time Setup

1. Open http://localhost:3000
2. Create your password (first-time only)
3. Go to Accounts to connect your email accounts
4. Start searching and managing your emails!

## Deployment (Railway)

1. Push your code to GitHub
2. Create a new project on Railway
3. Add PostgreSQL database
4. Set environment variables in Railway dashboard
5. Deploy!

### Required Environment Variables for Railway

```
APP_PASSWORD_HASH=<bcrypt hash>
ENCRYPTION_KEY=<64 hex characters>
NEXTAUTH_SECRET=<random string>
NEXTAUTH_URL=https://your-app.railway.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
OLLAMA_API_URL=<your Ollama endpoint>
```

## OAuth Setup

### Gmail (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `https://your-app.railway.app/api/accounts/callback/gmail`
6. Copy Client ID and Client Secret to environment variables

### Outlook (Microsoft Azure)

1. Go to [Azure Portal](https://portal.azure.com/)
2. App registrations → New registration
3. Supported account types: Personal Microsoft accounts
4. Add redirect URI: `https://your-app.railway.app/api/accounts/callback/outlook`
5. Create client secret
6. Add API permissions: Mail.Read, Mail.ReadWrite
7. Copy Application ID and Client Secret

### AOL (App Password)

1. Enable 2FA on your AOL account
2. Generate an app password
3. Enter the email and app password in the app

## License

MIT