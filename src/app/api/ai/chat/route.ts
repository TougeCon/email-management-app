import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts, chatHistory } from "@/lib/db/schema";
import { desc, count, inArray, and, eq, ilike, or } from "drizzle-orm";
import { queryOllama, buildEmailContext } from "@/lib/ai/ollama";
import { decrypt } from "@/lib/encryption";
import type { AIQueryContext } from "@/types";

// Fetch full email content from provider
async function fetchFullEmailContent(account: typeof emailAccounts.$inferSelect, providerEmailId: string): Promise<string | null> {
  try {
    const accessToken = decrypt(account.encryptedAccessToken);

    if (account.provider === "gmail") {
      const { google } = await import("googleapis");
      const { OAuth2Client } = await import("google-auth-library");

      const client = new OAuth2Client({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: client });
      const message = await gmail.users.messages.get({
        userId: "me",
        id: providerEmailId,
        format: "full",
      });

      let fullBody = "";
      const extractBody = (part: any) => {
        if (part.body?.data) {
          fullBody += Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          for (const p of part.parts) extractBody(p);
        }
      };
      extractBody(message.data.payload);
      return fullBody;
    } else if (account.provider === "outlook") {
      const { Client } = await import("@microsoft/microsoft-graph-client");

      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const msg: any = await graphClient
        .api(`/me/messages/${providerEmailId}`)
        .select("body")
        .get();

      return msg.body?.content || "";
    } else if (account.provider === "aol") {
      const { ImapFlow } = await import("imapflow");

      const client = new ImapFlow({
        host: "imap.aol.com",
        port: 993,
        secure: true,
        auth: {
          user: account.emailAddress,
          pass: accessToken,
        },
        logger: false,
      });

      try {
        await client.connect();
        await client.mailboxOpen("INBOX");

        const messages = await client.fetch(`*:${providerEmailId}`, {
          uid: true,
          source: true,
        });

        for await (const msg of messages) {
          if (msg.uid?.toString() === providerEmailId && msg.source) {
            return Buffer.from(msg.source).toString("utf-8");
          }
        }
      } finally {
        await client.logout().catch(() => {});
      }
    }
  } catch (err) {
    console.error("Failed to fetch full email content:", err);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory = [], accountIds = [] } = body;

    if (!message) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }

    // Get email metadata for context - filter by selected accounts
    let accounts = await db.select().from(emailAccounts);
    if (accountIds.length > 0) {
      accounts = accounts.filter((a) => accountIds.includes(a.id));
    }

    const totalEmails = await db
      .select({ count: count() })
      .from(emailCache);

    const accountConditions = accountIds.length > 0
      ? [inArray(emailCache.accountId, accountIds)]
      : [];

    const topSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
      })
      .from(emailCache)
      .where(accountConditions.length > 0 ? and(...accountConditions) : undefined)
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(20);

    // Get recent emails with full body preview for context
    const recentEmails = await db
      .select({
        id: emailCache.id,
        accountId: emailCache.accountId,
        providerEmailId: emailCache.providerEmailId,
        subject: emailCache.subject,
        sender: emailCache.sender,
        senderEmail: emailCache.senderEmail,
        receivedAt: emailCache.receivedAt,
        bodyPreview: emailCache.bodyPreview,
      })
      .from(emailCache)
      .where(accountConditions.length > 0 ? and(...accountConditions) : undefined)
      .orderBy(desc(emailCache.receivedAt))
      .limit(50);

    // Build context
    const context: AIQueryContext = {
      emailMetadata: {
        totalEmails: totalEmails[0]?.count || 0,
        topSenders: topSenders.map((s) => ({
          email: s.senderEmail || "unknown",
          count: s.count,
        })),
        recentEmails: recentEmails.map((e) => ({
          id: e.id,
          subject: e.subject || "(No subject)",
          sender: e.sender || "Unknown",
          senderEmail: e.senderEmail || "",
          date: e.receivedAt || new Date(),
          bodyPreview: e.bodyPreview,
        })),
        accounts: accounts.map((a) => ({
          email: a.emailAddress,
          provider: a.provider,
          emailCount: 0,
        })),
      },
    };

    // Get list of user's own email addresses (to exclude from spam/delete suggestions)
    const userOwnEmails = accounts.map((a) => a.emailAddress.toLowerCase());

    // Check if user is asking about a specific email that needs full content
    let fullEmailContent: string | null = null;
    const emailIdMatch = message.match(/email[:\s]*([a-f0-9-]{36})/i); // UUID pattern
    if (emailIdMatch) {
      const emailId = emailIdMatch[1];
      const emailEntry = recentEmails.find((e) => e.id === emailId);
      if (emailEntry) {
        const account = accounts.find((a) => a.id === emailEntry.accountId);
        if (account) {
          fullEmailContent = await fetchFullEmailContent(account, emailEntry.providerEmailId);
        }
      }
    }

    // Build the prompt with context and action capabilities
    const contextStr = buildEmailContext(context);

    const fullPrompt = `You are an AI email management assistant. Your job is to help the user efficiently process their email inbox.

## CONTEXT
${contextStr}

## USER'S EMAIL ADDRESSES (CRITICAL)
The user's own email addresses are: ${userOwnEmails.join(", ")}

## YOUR BEHAVIOR GUIDELINES

### Response Style
- Be BRIEF and DIRECT - aim for 2-4 sentences when possible
- Answer the question ASKED, don't go on tangents
- Use bullet points only when listing multiple items
- Don't explain basic concepts unless asked
- Don't be overly friendly or use filler phrases like "I'd be happy to help"
- Get straight to the point

### Understanding the User's Goals
- The user wants to process emails in LARGE BATCHES for efficiency
- They want to unsubscribe from newsletters AND delete all existing emails from those senders
- They prefer efficiency over perfection - better to process 1000 emails at once than review individually
- The Manage page (/manage) is their primary tool for bulk operations
- They can select multiple senders and use "Unsubscribe & Delete All" action

### Available Actions
When the user wants to take action, respond with EXACTLY this format:
"ACTION: [action] [criteria]"

Available actions:
- delete - removes emails to deletion queue (24hr undo)
- mark_spam - marks emails as spam
- archive - archives emails

Examples:
- "ACTION: delete emails from newsletter@example.com"
- "ACTION: mark_spam promotional emails with subject 'sale'"
- "ACTION: delete old emails containing 'verification'"

The frontend will:
1. Show how many emails match the criteria
2. Ask for confirmation if >10 emails
3. Execute the action after confirmation

### CRITICAL RULES
1. NEVER suggest actions on emails FROM the user's own addresses (${userOwnEmails.join(", ")})
   - Emails from user to themselves are SENT ITEMS and are IMPORTANT
   - Never mark user's own emails as spam or suggest deleting them
2. When suggesting cleanup, focus on:
   - Newsletters (unsubscribe + delete)
   - Marketing/promotional emails
   - Spam and scams
   - High-volume senders (10+ emails)
3. If asked "what should I delete" or similar, prioritize by volume (most emails first)

### What You CAN Help With
- Email statistics ("how many emails from X", "total emails")
- Identifying bulk cleanup opportunities (newsletters, spam, high-volume senders)
- Executing batch actions via ACTION: commands
- Finding specific emails by sender, subject, or content
- Suggesting which senders to unsubscribe from
- Answering questions about email patterns
- Reading full email content when user asks about specific emails
- Summarizing email threads or conversations
- Extracting information from emails (dates, links, instructions, etc.)

## FULL EMAIL CONTENT (if requested)
${fullEmailContent ? `The user is asking about a specific email. Here is the full content:\n\n${fullEmailContent}` : "No specific email content requested."}

## CONVERSATION HISTORY
${conversationHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

## CURRENT USER MESSAGE
User: ${message}

## YOUR RESPONSE
Be brief, direct, and actionable. If an action is requested, use ACTION: format. If asked a question, answer it directly without unnecessary elaboration. If the user asks about a specific email's content, use the FULL EMAIL CONTENT section above.

Response:`;

    // Query AI
    const aiResponse = await queryOllama(fullPrompt);

    // Save conversation to database
    try {
      await db.insert(chatHistory).values([
        { role: "user", content: message },
        { role: "assistant", content: aiResponse },
      ]);
    } catch (err) {
      console.error("Failed to save chat history:", err);
    }

    return Response.json({
      response: aiResponse,
      context: {
        totalEmails: context.emailMetadata.totalEmails,
        topSendersCount: context.emailMetadata.topSenders.length,
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return Response.json(
      { error: "Failed to process AI request" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get last 50 messages from chat history
    const messages = await db
      .select()
      .from(chatHistory)
      .orderBy(desc(chatHistory.createdAt))
      .limit(50);

    // Reverse to get chronological order
    messages.reverse();

    return Response.json({ messages });
  } catch (error) {
    console.error("Chat history fetch error:", error);
    return Response.json({ error: "Failed to fetch chat history" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear chat history
    await db.delete(chatHistory);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Chat history clear error:", error);
    return Response.json({ error: "Failed to clear chat history" }, { status: 500 });
  }
}
