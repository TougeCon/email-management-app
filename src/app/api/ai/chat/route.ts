import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts, chatHistory } from "@/lib/db/schema";
import { desc, count, inArray, and } from "drizzle-orm";
import { queryOllama, buildEmailContext } from "@/lib/ai/ollama";
import type { AIQueryContext } from "@/types";

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

    const recentEmails = await db
      .select({
        subject: emailCache.subject,
        sender: emailCache.sender,
        senderEmail: emailCache.senderEmail,
        receivedAt: emailCache.receivedAt,
        bodyPreview: emailCache.bodyPreview,
      })
      .from(emailCache)
      .where(accountConditions.length > 0 ? and(...accountConditions) : undefined)
      .orderBy(desc(emailCache.receivedAt))
      .limit(20);

    // Build context
    const context: AIQueryContext = {
      emailMetadata: {
        totalEmails: totalEmails[0]?.count || 0,
        topSenders: topSenders.map((s) => ({
          email: s.senderEmail || "unknown",
          count: s.count,
        })),
        recentEmails: recentEmails.map((e) => ({
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

    // Build the prompt with context and action capabilities
    const contextStr = buildEmailContext(context);

    const fullPrompt = `You are an AI assistant helping a user manage their emails. You have access to metadata about their emails.

${contextStr}

IMPORTANT: The user's own email addresses are: ${userOwnEmails.join(", ")}
- NEVER suggest deleting, marking as spam, or archiving emails FROM the user's own email address
- Emails from the user to themselves are sent items/replies and are IMPORTANT
- When identifying spam or newsletters, EXCLUDE any sender that matches the user's own email addresses

Previous conversation:
${conversationHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

User: ${message}

You can help the user take these actions by responding with a command:
- To delete emails: respond with "ACTION: delete [criteria]" e.g., "ACTION: delete emails from newsletter@example.com"
- To mark as spam: respond with "ACTION: mark_spam [criteria]" e.g., "ACTION: mark_spam emails from spam@domain.com"
- To archive: respond with "ACTION: archive [criteria]" e.g., "ACTION: archive old promotional emails"

The frontend will detect ACTION: commands and execute them automatically.

Please provide a helpful response. Follow these guidelines:
1. If asked about counts or statistics, provide specific numbers from the metadata
2. If asked to find emails, suggest search terms and filters they can use
3. If asked for cleanup suggestions, identify potential spam/newsletter patterns BUT EXCLUDE the user's own email addresses
4. For actions, use the ACTION: format above
5. Be concise but informative - use bullet points when listing items
6. Always mention specific sender emails or patterns when relevant
7. CRITICAL: Never suggest actions on emails from the user's own addresses - these are important sent items

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
