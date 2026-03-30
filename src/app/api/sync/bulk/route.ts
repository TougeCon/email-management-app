import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// No limits for bulk sync - get everything
const AOL_FOLDERS = ["INBOX", "Sent", "Spam", "Trash", "Archive", "Drafts", "Bulk Mail"];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId } = body || {};

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
        let totalEmails = 0;

        if (account.provider === "aol") {
          // AOL IMAP - sync ALL folders
          totalEmails = await syncAolAllFolders(account.id, account.emailAddress, accessToken);
        } else if (account.provider === "gmail") {
          totalEmails = await syncGmailAllLabels(account.id, accessToken);
        } else if (account.provider === "outlook") {
          totalEmails = await syncOutlookAllFolders(account.id, accessToken);
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
          emailsSynced: totalEmails,
        });
      } catch (error) {
        console.error(`Bulk sync error for ${account.provider} (${account.emailAddress}):`, error);
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
    console.error("Bulk sync error:", error);
    return Response.json(
      { error: "Bulk sync failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Extract plain text body from Gmail message
function extractGmailBody(payload: any): string {
  if (!payload) return "";

  // Try to get plain text body first
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, "base64").toString("utf-8").slice(0, 500);
    } catch {
      // Fall through to parts
    }
  }

  // Search through parts for plain text
  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      try {
        return Buffer.from(part.body.data, "base64").toString("utf-8").slice(0, 500);
      } catch {
        continue;
      }
    }
  }

  // Fallback to html if no plain text
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      try {
        const html = Buffer.from(part.body.data, "base64").toString("utf-8");
        return html.replace(/<[^>]*>/g, "").slice(0, 500);
      } catch {
        continue;
      }
    }
  }

  return "";
}

// Sync ALL Gmail labels
async function syncGmailAllLabels(accountId: string, accessToken: string): Promise<number> {
  const { google } = await import("googleapis");
  const { OAuth2Client } = await import("google-auth-library");

  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: client });

  // Get all labels
  const labelsResponse = await gmail.users.labels.list({ userId: "me" });
  const labels = labelsResponse.data.labels || [];

  let totalEmails = 0;

  for (const label of labels) {
    if (!label.id) continue;

    console.log(`[Gmail] Syncing label: ${label.name || label.id}`);

    let pageToken: string | undefined;
    do {
      const listResponse = await gmail.users.messages.list({
        userId: "me",
        labelIds: [label.id],
        maxResults: 500,
        pageToken,
      });

      const messages = listResponse.data.messages || [];
      pageToken = listResponse.data.nextPageToken || undefined;

      // Fetch message details - process ALL messages (not limited)
      // Process in batches of 50 to avoid rate limits
      const batchSize = 50;
      for (let batchStart = 0; batchStart < messages.length; batchStart += batchSize) {
        const batch = messages.slice(batchStart, batchStart + batchSize);

        for (const message of batch) {
          try {
            const fullMessage = await gmail.users.messages.get({
              userId: "me",
              id: message.id!,
              format: "full",
              metadataHeaders: ["From", "To", "Subject", "Date"],
            });

            const headers = fullMessage.data.payload?.headers || [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || null;

            const from = getHeader("from") || "";
            const fromEmail = extractEmail(from);
            const dateStr = getHeader("date");
            const bodyPreview = extractGmailBody(fullMessage.data.payload);

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
              bodyPreview: bodyPreview || null,
              cachedAt: new Date(),
            });
            totalEmails++;
          } catch (err) {
            console.error("Failed to fetch Gmail message:", err);
          }
        }

        // Small delay between batches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (pageToken);
  }

  return totalEmails;
}

// Sync ALL Outlook folders
async function syncOutlookAllFolders(accountId: string, accessToken: string): Promise<number> {
  const { Client } = await import("@microsoft/microsoft-graph-client");

  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  let totalEmails = 0;

  // Get all mail folders
  const foldersResponse: any = await client.api("/me/mailFolders").get();
  const folders = foldersResponse.value || [];

  for (const folder of folders) {
    console.log(`[Outlook] Syncing folder: ${folder.displayName || folder.name}`);

    let nextLink: string | null = null;

    do {
      // Fetch full body content for AI analysis
      let request: any = client.api(`/me/mailFolders/${folder.id}/messages`)
        .select("id,subject,from,receivedDateTime,isRead,body,internetMessageId,sender")
        .orderby("receivedDateTime desc")
        .top(100);

      if (nextLink) {
        request = client.api(nextLink);
      }

      const response: any = await request.get();
      const messages = response.value || [];
      nextLink = response["@odata.nextLink"] || null;

      for (const msg of messages) {
        // Extract plain text from body (HTML stripped)
        let bodyPreview = null;
        if (msg.body?.content) {
          const content = msg.body.content;
          if (msg.body.contentType === "html") {
            bodyPreview = content.replace(/<[^>]*>/g, "").slice(0, 500);
          } else {
            bodyPreview = content.slice(0, 500);
          }
        }

        await db.insert(emailCache).values({
          id: uuidv4(),
          accountId: accountId,
          providerEmailId: msg.id,
          subject: msg.subject || null,
          sender: msg.from?.emailAddress?.name || msg.sender?.emailAddress?.name || null,
          senderEmail: msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address || null,
          receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
          isRead: msg.isRead,
          snippet: bodyPreview,
          bodyPreview: bodyPreview || null,
          cachedAt: new Date(),
        });
        totalEmails++;
      }
    } while (nextLink);
  }

  return totalEmails;
}

// Strip HTML and get plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

// Sync ALL AOL IMAP folders
async function syncAolAllFolders(accountId: string, email: string, appPassword: string): Promise<number> {
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
    socketTimeout: 120000,
  });

  try {
    await client.connect();
    let totalEmails = 0;
    let duplicatesSkipped = 0;

    const mailboxes = await client.list();
    console.log(`[AOL] Found ${mailboxes.length} folders`);

    for (const mailbox of mailboxes) {
      const path = mailbox.path;
      console.log(`[AOL] Syncing folder: ${path}`);

      try {
        const opened = await client.mailboxOpen(path);
        const messageCount = opened?.exists || 0;

        if (messageCount === 0) {
          console.log(`[AOL] Folder ${path} is empty, skipping`);
          continue;
        }

        console.log(`[AOL] Folder ${path} has ${messageCount} messages`);

        // Fetch UIDs first
        console.log(`[AOL] Fetching UIDs for ${path}...`);
        const uidList = await client.fetch("1:*", { uid: true, envelope: true });

        let fetched = 0;
        for await (const message of uidList) {
          try {
            const uid = message.uid?.toString();
            if (!uid) continue;

            // Check if already cached
            const existing = await db.query.emailCache.findFirst({
              where: (table, { eq }) => eq(table.providerEmailId, uid),
            });

            if (existing) {
              duplicatesSkipped++;
              fetched++;
              continue;
            }

            // Fetch body content (first 500 chars)
            let bodyPreview: string | null = null;
            try {
              // Fetch full message source and extract body
              const messages = await client.fetch(`${uid}`, { source: true });
              for await (const msg of messages) {
                if (msg.source) {
                  const rawSource = Buffer.from(msg.source).toString("utf-8");
                  // Extract body after headers (double CRLF separates headers from body)
                  const parts = rawSource.split(/\r\n\r\n/);
                  if (parts.length > 1) {
                    const body = parts.slice(1).join('\r\n\r\n');
                    bodyPreview = stripHtml(body).slice(0, 500);
                  }
                }
                break; // Only process first message
              }
            } catch (bodyErr) {
              console.log(`[AOL] Could not fetch body for UID ${uid}`);
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
              snippet: bodyPreview,
              bodyPreview: bodyPreview || null,
              cachedAt: new Date(),
            });
            totalEmails++;
            fetched++;

            if (fetched % 1000 === 0) {
              console.log(`[AOL] Progress: ${fetched}/${messageCount} in ${path} (${totalEmails} new, ${duplicatesSkipped} duplicates)`);
            }
          } catch (err) {
            console.error("Failed to cache AOL message:", err);
          }
        }

        console.log(`[AOL] Finished ${path}: ${totalEmails} new, ${duplicatesSkipped} duplicates skipped`);
      } catch (err) {
        console.error(`[AOL] Error syncing folder ${path}:`, err);
      }
    }

    console.log(`[AOL] Total: ${totalEmails} new emails cached, ${duplicatesSkipped} duplicates skipped`);
    return totalEmails;
  } finally {
    await client.logout();
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}
