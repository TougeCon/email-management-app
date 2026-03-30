import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { desc, count, max, not, ilike, and, or } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Patterns that indicate newsletters/marketing (good for unsubscribe)
    const marketingPatterns = [
      ilike(emailCache.subject, "%newsletter%"),
      ilike(emailCache.subject, "%promo%"),
      ilike(emailCache.subject, "%sale%"),
      ilike(emailCache.subject, "%offer%"),
      ilike(emailCache.subject, "%deal%"),
      ilike(emailCache.subject, "%weekly%"),
      ilike(emailCache.subject, "%daily%"),
      ilike(emailCache.subject, "%digest%"),
      ilike(emailCache.senderEmail, "%noreply%"),
      ilike(emailCache.senderEmail, "%no-reply%"),
      ilike(emailCache.senderEmail, "%newsletter%"),
      ilike(emailCache.senderEmail, "%marketing%"),
    ];

    // Patterns that indicate spam/junk (good for deletion)
    const spamPatterns = [
      ilike(emailCache.subject, "%winner%"),
      ilike(emailCache.subject, "%congratulations%"),
      ilike(emailCache.subject, "%claim%"),
      ilike(emailCache.subject, "%verify%"),
      ilike(emailCache.subject, "%suspended%"),
      ilike(emailCache.subject, "%urgent%"),
      ilike(emailCache.subject, "%lottery%"),
      ilike(emailCache.subject, "%crypto%"),
      ilike(emailCache.subject, "%bitcoin%"),
      ilike(emailCache.senderEmail, "%@tempmail%"),
      ilike(emailCache.senderEmail, "%@10minutemail%"),
    ];

    // Get all senders with marketing patterns
    const marketingSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
        sampleSubject: max(emailCache.subject),
        lastReceived: max(emailCache.receivedAt),
      })
      .from(emailCache)
      .where(
        and(
          or(...marketingPatterns),
          not(ilike(emailCache.senderEmail, "%@gmail.com")),
          not(ilike(emailCache.senderEmail, "%@yahoo.com")),
          not(ilike(emailCache.senderEmail, "%@hotmail.com")),
          not(ilike(emailCache.senderEmail, "%@outlook.com")),
          not(ilike(emailCache.senderEmail, "%@aol.com"))
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(100);

    // Get all senders with spam patterns
    const spamSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
        sampleSubject: max(emailCache.subject),
        lastReceived: max(emailCache.receivedAt),
      })
      .from(emailCache)
      .where(
        and(
          or(...spamPatterns),
          not(ilike(emailCache.senderEmail, "%@gmail.com")),
          not(ilike(emailCache.senderEmail, "%@yahoo.com")),
          not(ilike(emailCache.senderEmail, "%@hotmail.com")),
          not(ilike(emailCache.senderEmail, "%@outlook.com")),
          not(ilike(emailCache.senderEmail, "%@aol.com"))
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(100);

    const suggestions: Array<{
      sender: string | null;
      senderEmail: string | null;
      count: number;
      sampleSubject: string | null;
      lastReceived: Date | null;
      actionType: "unsubscribe" | "delete";
      hasUnsubscribeLink: boolean;
    }> = [];

    // Filter marketing senders (3+ emails) - these get unsubscribe action
    for (const sender of marketingSenders.filter(s => Number(s.count) >= 3)) {
      if (!sender.senderEmail) continue;

      suggestions.push({
        sender: sender.sender,
        senderEmail: sender.senderEmail,
        count: Number(sender.count),
        sampleSubject: sender.sampleSubject,
        lastReceived: sender.lastReceived,
        actionType: "unsubscribe",
        hasUnsubscribeLink: true,
      });
    }

    // Filter spam senders (3+ emails) - these get delete action
    for (const sender of spamSenders.filter(s => Number(s.count) >= 3)) {
      if (!sender.senderEmail) continue;

      // Skip if already in unsubscribe list
      if (suggestions.some(s => s.senderEmail === sender.senderEmail)) continue;

      suggestions.push({
        sender: sender.sender,
        senderEmail: sender.senderEmail,
        count: Number(sender.count),
        sampleSubject: sender.sampleSubject,
        lastReceived: sender.lastReceived,
        actionType: "delete",
        hasUnsubscribeLink: false,
      });
    }

    // Sort by count (most emails first)
    suggestions.sort((a, b) => b.count - a.count);

    return Response.json({
      suggestions: suggestions.slice(0, 100),
      total: suggestions.length,
      unsubscribeCount: suggestions.filter(s => s.actionType === "unsubscribe").length,
      deleteCount: suggestions.filter(s => s.actionType === "delete").length,
    });
  } catch (error) {
    console.error("Suggestions error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Internal server error", details: errorMessage }, { status: 500 });
  }
}
