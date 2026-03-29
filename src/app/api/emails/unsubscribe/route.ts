import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { eq, ilike, desc } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { senderEmail } = body;

    if (!senderEmail) {
      return Response.json({ error: "Sender email required" }, { status: 400 });
    }

    // Find the most recent email from this sender that might have unsubscribe info
    const emails = await db
      .select({
        id: emailCache.id,
        subject: emailCache.subject,
        snippet: emailCache.snippet,
        bodyPreview: emailCache.bodyPreview,
      })
      .from(emailCache)
      .where(ilike(emailCache.senderEmail, senderEmail))
      .orderBy(desc(emailCache.receivedAt))
      .limit(10);

    if (emails.length === 0) {
      return Response.json({ error: "No emails found from this sender" }, { status: 404 });
    }

    // Look for unsubscribe link in body preview or snippet
    let unsubscribeUrl: string | null = null;

    for (const email of emails) {
      const text = (email.bodyPreview || email.snippet || "").toLowerCase();

      // Look for common unsubscribe URL patterns
      const urlPatterns = [
        /unsubscribe[=:]\s*https?:\/\/[^\s]+/i,
        /opt.out[=:]\s*https?:\/\/[^\s]+/i,
        /https?:\/\/[^\s]*unsubscribe[^\s]*/i,
      ];

      for (const pattern of urlPatterns) {
        const match = text.match(pattern);
        if (match) {
          // Extract the URL
          const urlMatch = match[0].match(/https?:\/\/[^\s]+/i);
          if (urlMatch) {
            unsubscribeUrl = urlMatch[0];
            break;
          }
        }
      }

      if (unsubscribeUrl) break;
    }

    // Return the unsubscribe URL if found, or instructions
    return Response.json({
      success: true,
      senderEmail,
      unsubscribeUrl,
      message: unsubscribeUrl
        ? "Unsubscribe link found"
        : "No direct unsubscribe link found. Check the email for unsubscribe instructions.",
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
