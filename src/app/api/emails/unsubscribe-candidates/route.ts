import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { desc, count, eq, or, ilike, and, not, max } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 1: Find candidate senders based on common newsletter/marketing patterns
    // These are heuristic - we look for senders who send lots of emails
    // with newsletter-like characteristics
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

    // Get all senders with marketing patterns first
    const allSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
        sampleSubject: max(emailCache.subject),
      })
      .from(emailCache)
      .where(
        and(
          or(...marketingPatterns),
          not(ilike(emailCache.senderEmail, "%@gmail.com")), // Exclude personal emails
          not(ilike(emailCache.senderEmail, "%@yahoo.com")),
          not(ilike(emailCache.senderEmail, "%@hotmail.com")),
          not(ilike(emailCache.senderEmail, "%@outlook.com")),
          not(ilike(emailCache.senderEmail, "%@aol.com"))
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(200);

    // Filter in JavaScript for 3+ emails (having clause doesn't work with Drizzle ORM)
    const highVolumeSenders = allSenders.filter(s => Number(s.count) >= 3);

    // Step 2: For each candidate sender, check if they have unsubscribe patterns
    const candidates = [];

    for (const sender of highVolumeSenders) {
      if (!sender.senderEmail) continue;

      // High-volume senders with marketing patterns ARE the candidates
      // We don't need to verify unsubscribe links - if they send 3+ marketing emails,
      // they're likely newsletters/marketing
      candidates.push({
        sender: sender.sender,
        senderEmail: sender.senderEmail,
        count: Number(sender.count),
        sampleSubject: sender.sampleSubject,
        hasListUnsubscribe: false, // Will be detected when user tries to unsubscribe
        hasUnsubscribeLink: true,  // Assume yes for marketing senders
      });
    }

    // Sort by count (most emails first)
    candidates.sort((a, b) => b.count - a.count);

    return Response.json({
      candidates: candidates.slice(0, 100), // Top 100
      total: candidates.length,
    });
  } catch (error) {
    console.error("Unsubscribe candidates error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Internal server error", details: errorMessage }, { status: 500 });
  }
}
