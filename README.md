# Email Management App

A secure web application for managing multiple email accounts, with AI-powered search and bulk spam cleanup.

## Features

- **Multi-Account Support**: Connect Gmail, Outlook/Hotmail, and AOL accounts
- **Cross-Account Search**: Search across all your emails from one interface
- **AI-Powered Assistant**: Use natural language to find and manage emails (Groq API)
- **Bulk Spam Cleanup**: Delete or archive multiple emails at once
- **Bulk Unsubscribe**: Detect and unsubscribe from newsletters and marketing emails
- **Cleanup Rules**: Create automatic rules to process incoming emails
- **Account Groups**: Organize accounts into groups for easier searching
- **Undo Queue**: Restore deleted emails within 24 hours
- **Chat History**: AI conversations persist across sessions

## Quick Start

See **[SETUP.md](SETUP.md)** for detailed setup instructions.

```bash
# Generate .env with secure keys
node setup-env.js

# Install dependencies
npm install

# Set DATABASE_URL in .env (Railway PostgreSQL or local)

# Push database schema
npm run db:push

# Start dev server
npm run dev
```

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Password-protected single-user access (NextAuth)
- **AI**: Groq API with Llama 3 models

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run migrations

## Deployment

### Railway

1. Push to GitHub
2. Create Railway project from repo
3. Add PostgreSQL database
4. Set environment variables (see SETUP.md)
5. Deploy!

**Important:** Update OAuth redirect URIs after deployment:
- Gmail: `https://your-app.railway.app/api/accounts/callback/gmail`
- Outlook: `https://your-app.railway.app/api/accounts/callback/outlook`

## License

MIT
