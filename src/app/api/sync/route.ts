import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const BATCH_SIZE = 100;
const MAX_EMAILS_PER_SYNC = 1000;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, maxEmails = MAX_EMAILS_PER_SYNC } = body || {};

    // Get accounts to sync
    let accounts = await db.select().from(emailAccounts);
    if (accountId) {
      accounts = accounts.filter((a) => a.id === accountId);
    }

    if (accounts.length === 0) {
      return Response.json({ error: "No accounts to sync" }, { status: 400 });
    }

    const results = [];

    for (const account of accounts) {
      try {
        const accessToken = decrypt(account.encryptedAccessToken);
        let emails: SyncEmail[] = [];

        if (account.provider === "gmail") {
          emails = await fetchGmailEmails(accessToken, Math.min(BATCH_SIZE, maxEmails));
        } else if (account.provider === "outlook") {
          emails = await fetchOutlookEmails(accessToken, Math.min(BATCH_SIZE, maxEmails));
        } else if (account.provider === "aol") {
          // AOL uses IMAP with app password
          emails = await fetchAolEmails(account.emailAddress, accessToken, Math.min(BATCH_SIZE, maxEmails));
        }

        // Cache emails in database
        let cached = 0;
        for (const email of emails) {
          const cacheId = uuidv4();
          await db.insert(emailCache).values({
            id: cacheId,
            accountId: account.id,
            providerEmailId: email.id,
            subject: email.subject,
            sender: email.from || email.fromEmail,
            senderEmail: email.fromEmail,
            receivedAt: email.date ? new Date(email.date) : email.receivedAt,
            isRead: email.isRead,
            snippet: email.snippet,
            cachedAt: new Date(),
          });
          cached++;
        }

        // Update last synced time
        await db
          .update(emailAccounts)
          .set({ lastSyncedAt: new Date() })
          .where(eq(emailAccounts.id, account.id));

        results.push({
          accountId: account.id,
          provider: account.provider,
          email: account.emailAddress,
          status: "success",
          emailsSynced: cached,
        });
      } catch (error) {
        console.error(`Sync error for ${account.provider} (${account.emailAddress}):`, error);
        results.push({
          accountId: account.id,
          provider: account.provider,
          email: account.emailAddress,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + (r.emailsSynced || 0), 0);

    return Response.json({
      success: true,
      results,
      totalEmailsSynced: totalSynced,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return Response.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Gmail sync
async function fetchGmailEmails(accessToken: string, maxResults: number): Promise<SyncEmail[]> {
  const { google } = await import("googleapis");
  const { OAuth2Client } = await import("google-auth-library");

  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  // List messages
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: Math.min(maxResults, 500),
    q: "newer_than:30d", // Only sync last 30 days by default
  });

  const messages = listResponse.data.messages || [];
  const emails: SyncEmail[] = [];

  // Fetch details in batches
  for (let i = 0; i < Math.min(messages.length, 50); i++) {
    const message = messages[i];
    try {
      const fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = fullMessage.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || null;

      const from = getHeader("from") || "";
      const fromEmail = extractEmail(from);

      emails.push({
        id: message.id!,
        subject: getHeader("subject"),
        from: from,
        fromEmail,
        date: getHeader("date"),
        snippet: fullMessage.data.snippet || null,
        isRead: !fullMessage.data.labelIds?.includes("UNREAD"),
      });
    } catch (err) {
      console.error("Failed to fetch Gmail message:", err);
    }
  }

  return emails;
}

// Outlook sync
async function fetchOutlookEmails(accessToken: string, maxResults: number): Promise<SyncEmail[]> {
  const { Client } = await import("@microsoft/microsoft-graph-client");

  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  const response = await client
    .api("/me/messages")
    .select("id,subject,from,receivedDateTime,isRead,bodyPreview,internetMessageId")
    .orderby("receivedDateTime desc")
    .top(Math.min(maxResults, 500))
    .get();

  return (response.value || []).map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || null,
    from: msg.from?.emailAddress?.name || null,
    fromEmail: msg.from?.emailAddress?.address || null,
    receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
    isRead: msg.isRead,
    snippet: msg.bodyPreview || null,
  }));
}

// AOL IMAP sync
async function fetchAolEmails(email: string, appPassword: string, maxResults: number): Promise<SyncEmail[]> {
  const { default: ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host: "imap.aol.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    const emails: SyncEmail[] = [];
    const messages = await client.fetch({ limit: Math.min(maxResults, 500) }, { envelope: true, source: false });

    for await (const message of messages) {
      emails.push({
        id: message.uid?.toString() || String(Date.now()) + Math.random(),
        subject: message.envelope?.subject || null,
        from: message.envelope?.from?.[0]?.address || null,
        fromEmail: message.envelope?.from?.[0]?.address || null,
        date: message.envelope?.date?.toISOString() || null,
        snippet: null,
        isRead: !message.flags?.has("\\Seen"),
      });
    }

    return emails;
  } finally {
    await client.logout();
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

interface SyncEmail {
  id: string;
  subject: string | null;
  from: string | null;
  fromEmail?: string | null;
  date?: string | null;
  receivedAt?: Date | null;
  snippet: string | null;
  isRead: boolean;
}
