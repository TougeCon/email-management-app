import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts } from "@/lib/db/schema";
import { desc, count, sql } from "drizzle-orm";
import { queryOllama, buildEmailContext } from "@/lib/ai/ollama";
import type { AIQueryContext } from "@/types";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }

    // Get email metadata for context
    const accounts = await db.select().from(emailAccounts);

    const totalEmails = await db
      .select({ count: count() })
      .from(emailCache);

    const topSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
      })
      .from(emailCache)
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
          date: e.receivedAt || new Date(),
        })),
        accounts: accounts.map((a) => ({
          email: a.emailAddress,
          provider: a.provider,
          emailCount: 0, // Would need separate query per account
        })),
      },
    };

    // Build the prompt with context
    const contextStr = buildEmailContext(context);

    const fullPrompt = `You are an AI assistant helping a user manage their emails. You have access to metadata about their emails but not the actual content for privacy reasons.

${contextStr}

Previous conversation:
${conversationHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}

User: ${message}

Please provide a helpful response. Follow these guidelines:
1. If asked about counts or statistics, provide specific numbers from the metadata
2. If asked to find emails, suggest search terms and filters they can use
3. If asked for cleanup suggestions, identify potential spam/newsletter patterns
4. If asked for actions, provide step-by-step guidance
5. Be concise but informative - use bullet points when listing items
6. Always mention specific sender emails or patterns when relevant

Response:`;

    // Query Ollama
    const aiResponse = await queryOllama(fullPrompt);

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
      { error: "Failed to process AI request. Make sure Ollama is running." },
      { status: 500 }
    );
  }
}