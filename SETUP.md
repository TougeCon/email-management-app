# Local Development Setup Guide

## Quick Start

### 1. Generate Environment File

```bash
node setup-env.js
```

This creates a `.env` file with secure random keys.

### 2. Set Up Database

**Option A: Local PostgreSQL**
```bash
# Install PostgreSQL locally, then set:
DATABASE_URL=postgresql://localhost:5432/email-management
```

**Option B: Railway PostgreSQL (Recommended for Production)**
1. Create a Railway project and add a PostgreSQL database
2. Copy the connection string from Railway dashboard
3. Set in `.env`:
   ```
   DATABASE_URL=postgresql://...
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Migrations

```bash
npm run db:push
```

### 5. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000

### 6. First-Time Setup

1. Create your app password (minimum 8 characters)
2. Go to Accounts page to connect email accounts

## OAuth Setup (Optional - for email provider integration)

### Gmail OAuth

1. Go to https://console.cloud.google.com/
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI:
   ```
   http://localhost:3000/api/accounts/callback/gmail
   ```
6. Copy Client ID and Client Secret to `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
   ```

### Microsoft OAuth (Outlook/Hotmail)

1. Go to https://portal.azure.com/
2. App Registrations → New registration
3. Supported account types: **Personal Microsoft accounts**
4. Add redirect URI:
   ```
   http://localhost:3000/api/accounts/callback/outlook
   ```
5. Create client secret
6. Add API permissions: `Mail.Read`, `Mail.ReadWrite`
7. Copy to `.env`:
   ```
   MICROSOFT_CLIENT_ID=your-app-id
   MICROSOFT_CLIENT_SECRET=your-secret
   NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your-app-id
   ```

## Deploying to Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Add your remote and push
```

### 2. Create Railway Project

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Add PostgreSQL database

### 3. Set Environment Variables

In Railway dashboard, set these:

```
ENCRYPTION_KEY=<from your .env>
NEXTAUTH_SECRET=<from your .env>
NEXTAUTH_URL=https://your-app.railway.app
DATABASE_URL=<Railway auto-provides this>

# OAuth (update redirect URIs first!)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=...

# AI features (Groq API recommended)
AI_API_URL=https://api.groq.com/openai/v1/chat/completions
AI_API_KEY=your-groq-api-key
AI_MODEL=llama3-8b-8192
```

### 4. Update OAuth Redirect URIs

**Important:** Update your Google and Microsoft OAuth redirect URIs to:
```
https://your-app.railway.app/api/accounts/callback/gmail
https://your-app.railway.app/api/accounts/callback/outlook
```

### 5. Deploy

Railway auto-deploys on push. Your app should be live!

## Troubleshooting

### "DATABASE_URL must be set"
- Make sure you ran `node setup-env.js`
- Set your database connection string

### "relation does not exist"
- Run `npm run db:push` to create tables
- Or visit `/api/migrate` while logged in

### OAuth "redirect_uri_mismatch"
- Check that your redirect URI in Google/Microsoft console matches your `NEXTAUTH_URL`
- For local dev: `http://localhost:3000/api/accounts/callback/...`
- For Railway: `https://your-app.railway.app/api/accounts/callback/...`

### AI Chat not working
- Set `AI_API_KEY` with a Groq API key (free at https://groq.com)
- Default model is `llama3-8b-8192`
