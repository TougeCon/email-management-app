import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { eq, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Chunked sync for large mailboxes
 * Call repeatedly with lastMessageId to get next chunk
 * Returns { hasMore: true, lastMessageId, syncedCount } to continue
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, chunkSize = 500, lastMessageId } = body || {};

    if (!accountId) {
      return Response.json({ error: "accountId required" }, { status: 400 });
    }

    const account = await db.query.emailAccounts.findFirst({
      where: eq(emailAccounts.id, accountId),
    });

    if (!account) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const accessToken = decrypt(account.encryptedAccessToken);
    let result: { hasMore: boolean; lastMessageId: string | null; syncedCount: number };

    if (account.provider === "gmail") {
      result = await syncGmailChunk(accountId, accessToken, chunkSize, lastMessageId);
    } else if (account.provider === "outlook") {
      result = await syncOutlookChunk(accountId, accessToken, chunkSize, lastMessageId);
    } else if (account.provider === "aol") {
      result = await syncAolChunk(accountId, account.emailAddress, accessToken, chunkSize, lastMessageId);
    } else {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    // Update last synced time
    await db
      .update(emailAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(emailAccounts.id, accountId));

    return Response.json({
      success: true,
      hasMore: result.hasMore,
      lastMessageId: result.lastMessageId,
      syncedCount: result.syncedCount,
    });
  } catch (error) {
    console.error("Chunked sync error:", error);
    return Response.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Gmail chunked sync
async function syncGmailChunk(
  accountId: string,
  accessToken: string,
  chunkSize: number,
  lastMessageId?: string | null
): Promise<{ hasMore: boolean; lastMessageId: string | null; syncedCount: number }> {
  const { google } = await import("googleapis");
  const { OAuth2Client } = await import("google-auth-library");

  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  // Get all messages (newest first)
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: chunkSize,
    pageToken: lastMessageId || undefined,
  });

  const messages = listResponse.data.messages || [];
  let syncedCount = 0;

  for (const message of messages) {
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
      const dateStr = getHeader("date");

      await db.insert(emailCache).values({
        id: uuidv4(),
        accountId: accountId,
        providerEmailId: message.id!,
        subject: getHeader("subject"),
        sender: from,
        senderEmail: fromEmail,
        receivedAt: dateStr ? new Date(dateStr) : new Date(),
        isRead: !fullMessage.data.labelIds?.includes("UNREAD"),
        snippet: fullMessage.data.snippet || null,
        cachedAt: new Date(),
      });
      syncedCount++;
    } catch (err) {
      console.error("Failed to fetch Gmail message:", err);
    }
  }

  const hasMore = !!listResponse.data.nextPageToken;
  console.log(`[Gmail] Synced ${syncedCount} emails, hasMore: ${hasMore}, messages fetched: ${messages.length}`);

  return {
    hasMore,
    lastMessageId: listResponse.data.nextPageToken || null,
    syncedCount,
  };
}

// Outlook chunked sync
async function syncOutlookChunk(
  accountId: string,
  accessToken: string,
  chunkSize: number,
  _lastMessageId?: string | null
): Promise<{ hasMore: boolean; lastMessageId: string | null; syncedCount: number }> {
  const { Client } = await import("@microsoft/microsoft-graph-client");

  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  const response: any = await client
    .api("/me/messages")
    .select("id,subject,from,receivedDateTime,isRead,bodyPreview,internetMessageId")
    .orderby("receivedDateTime desc")
    .top(chunkSize)
    .get();

  const messages = response.value || [];
  let syncedCount = 0;

  for (const msg of messages) {
    try {
      await db.insert(emailCache).values({
        id: uuidv4(),
        accountId: accountId,
        providerEmailId: msg.id,
        subject: msg.subject || null,
        sender: msg.from?.emailAddress?.name || msg.sender?.emailAddress?.name || null,
        senderEmail: msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address || null,
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
        isRead: msg.isRead,
        snippet: msg.bodyPreview || null,
        cachedAt: new Date(),
      });
      syncedCount++;
    } catch (err) {
      console.error("Failed to cache Outlook message:", err);
    }
  }

  // Outlook uses @odata.nextLink for pagination
  return {
    hasMore: !!response["@odata.nextLink"],
    lastMessageId: response["@odata.nextLink"] || null,
    syncedCount,
  };
}

// AOL chunked sync
async function syncAolChunk(
  accountId: string,
  email: string,
  appPassword: string,
  chunkSize: number,
  _lastMessageId?: string | null
): Promise<{ hasMore: boolean; lastMessageId: string | null; syncedCount: number }> {
  const imapflow = await import("imapflow");
  const ImapFlow = imapflow.ImapFlow;

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

    const messages = await client.fetch("1:*", { uid: true, envelope: true, source: false });
    let syncedCount = 0;
    let processed = 0;

    for await (const message of messages) {
      if (processed >= chunkSize) break;

      try {
        const uid = message.uid?.toString();
        if (!uid) continue;

        // Check if already cached
        const existing = await db.query.emailCache.findFirst({
          where: (table, { eq }) => eq(table.providerEmailId, uid),
        });

        if (existing) {
          processed++;
          continue;
        }

        await db.insert(emailCache).values({
          id: uuidv4(),
          accountId: accountId,
          providerEmailId: uid,
          subject: message.envelope?.subject || null,
          sender: message.envelope?.from?.[0]?.address || null,
          senderEmail: message.envelope?.from?.[0]?.address || null,
          receivedAt: message.envelope?.date ? new Date(message.envelope.date) : null,
          isRead: !message.flags?.has("\\Seen"),
          cachedAt: new Date(),
        });
        syncedCount++;
        processed++;
      } catch (err) {
        console.error("Failed to cache AOL message:", err);
      }
    }

    return {
      hasMore: processed < (client as any).mailbox?.exists,
      lastMessageId: null, // AOL uses sequence numbers, not page tokens
      syncedCount,
    };
  } finally {
    await client.logout();
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}
