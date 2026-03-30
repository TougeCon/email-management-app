import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { desc, count, max, not, ilike, and, or, sql } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Exclude personal email domains
    const excludePersonalEmails = [
      not(ilike(emailCache.senderEmail, "%@gmail.com")),
      not(ilike(emailCache.senderEmail, "%@yahoo.com")),
      not(ilike(emailCache.senderEmail, "%@hotmail.com")),
      not(ilike(emailCache.senderEmail, "%@outlook.com")),
      not(ilike(emailCache.senderEmail, "%@aol.com")),
      not(ilike(emailCache.senderEmail, "%@icloud.com")),
      not(ilike(emailCache.senderEmail, "%@protonmail.com")),
      not(ilike(emailCache.senderEmail, "%@mail.com")),
    ];

    // === UNSUBSCRIBE CANDIDATES ===
    // Newsletters, marketing, promotions - things you might want to unsubscribe from
    const unsubscribePatterns = [
      // Newsletter patterns
      ilike(emailCache.subject, "%newsletter%"),
      ilike(emailCache.subject, "%weekly%"),
      ilike(emailCache.subject, "%daily%"),
      ilike(emailCache.subject, "%digest%"),
      ilike(emailCache.subject, "%roundup%"),
      ilike(emailCache.subject, "%briefing%"),
      ilike(emailCache.subject, "%update%"),
      ilike(emailCache.subject, "%edition%"),

      // Marketing/promo patterns
      ilike(emailCache.subject, "%promo%"),
      ilike(emailCache.subject, "%sale%"),
      ilike(emailCache.subject, "%offer%"),
      ilike(emailCache.subject, "%deal%"),
      ilike(emailCache.subject, "%discount%"),
      ilike(emailCache.subject, "%save%"),
      ilike(emailCache.subject, "%clearance%"),
      ilike(emailCache.subject, "%flash sale%"),
      ilike(emailCache.subject, "%black friday%"),
      ilike(emailCache.subject, "%cyber monday%"),

      // Shopping/retail
      ilike(emailCache.subject, "%new arrival%"),
      ilike(emailCache.subject, "%just in%"),
      ilike(emailCache.subject, "%trending%"),
      ilike(emailCache.subject, "%recommend%"),
      ilike(emailCache.subject, "%your cart%"),
      ilike(emailCache.subject, "%abandoned cart%"),
      ilike(emailCache.subject, "%back in stock%"),
      ilike(emailCache.subject, "%price drop%"),

      // Travel deals
      ilike(emailCache.subject, "%flight%"),
      ilike(emailCache.subject, "%hotel%"),
      ilike(emailCache.subject, "%vacation%"),
      ilike(emailCache.subject, "%getaway%"),
      ilike(emailCache.subject, "%travel deal%"),
      ilike(emailCache.subject, "%airfare%"),
      ilike(emailCache.subject, "%booking%"),

      // Social media notifications
      ilike(emailCache.subject, "%notification%"),
      ilike(emailCache.subject, "%mentioned you%"),
      ilike(emailCache.subject, "%liked your%"),
      ilike(emailCache.subject, "%commented on%"),
      ilike(emailCache.subject, "%follower%"),
      ilike(emailCache.subject, "%connection%"),
      ilike(emailCache.subject, "%invite%"),

      // Dating apps
      ilike(emailCache.senderEmail, "%@match.com%"),
      ilike(emailCache.senderEmail, "%@tinder.com%"),
      ilike(emailCache.senderEmail, "%@bumble.com%"),
      ilike(emailCache.senderEmail, "%@hinge.co%"),
      ilike(emailCache.subject, "%new match%"),
      ilike(emailCache.subject, "%message%"),
      ilike(emailCache.subject, "%like%"),

      // Food delivery
      ilike(emailCache.senderEmail, "%@doordash.com%"),
      ilike(emailCache.senderEmail, "%@ubereats.com%"),
      ilike(emailCache.senderEmail, "%@grubhub.com%"),
      ilike(emailCache.subject, "%off%"),
      ilike(emailCache.subject, "%free delivery%"),

      // Gaming/entertainment
      ilike(emailCache.senderEmail, "%@steampowered.com%"),
      ilike(emailCache.senderEmail, "%@epicgames.com%"),
      ilike(emailCache.senderEmail, "%@playstation.com%"),
      ilike(emailCache.senderEmail, "%@xbox.com%"),
      ilike(emailCache.subject, "%game%"),
      ilike(emailCache.subject, "%dlc%"),
      ilike(emailCache.subject, "%beta%"),

      // Unsubscribe-related (already marketing)
      ilike(emailCache.subject, "%unsubscribe%"),
      ilike(emailCache.subject, "%opt-out%"),
      ilike(emailCache.subject, "%email preference%"),

      // Sender patterns (marketing departments)
      ilike(emailCache.senderEmail, "%noreply%"),
      ilike(emailCache.senderEmail, "%no-reply%"),
      ilike(emailCache.senderEmail, "%newsletter%"),
      ilike(emailCache.senderEmail, "%marketing%"),
      ilike(emailCache.senderEmail, "%promo%"),
      ilike(emailCache.senderEmail, "%deals%"),
      ilike(emailCache.senderEmail, "%offers%"),
    ];

    // === DELETE CANDIDATES ===
    // Spam, junk, scams - things to delete immediately
    const deletePatterns = [
      // Scam/spam keywords
      ilike(emailCache.subject, "%winner%"),
      ilike(emailCache.subject, "%congratulations%"),
      ilike(emailCache.subject, "%claim%"),
      ilike(emailCache.subject, "%verify%"),
      ilike(emailCache.subject, "%suspended%"),
      ilike(emailCache.subject, "%urgent%"),
      ilike(emailCache.subject, "%lottery%"),
      ilike(emailCache.subject, "%crypto%"),
      ilike(emailCache.subject, "%bitcoin%"),
      ilike(emailCache.subject, "%nft%"),
      ilike(emailCache.subject, "%inheritance%"),
      ilike(emailCache.subject, "%million dollars%"),
      ilike(emailCache.subject, "%wire transfer%"),
      ilike(emailCache.subject, "%bank account%"),
      ilike(emailCache.subject, "%social security%"),
      ilike(emailCache.subject, "%irs%"),
      ilike(emailCache.subject, "%tax refund%"),
      ilike(emailCache.subject, "%stimulus%"),
      ilike(emailCache.subject, "%grant%"),
      ilike(emailCache.subject, "%prize%"),
      ilike(emailCache.subject, "%award%"),
      ilike(emailCache.subject, "%selected%"),
      ilike(emailCache.subject, "%choosen%"),
      ilike(emailCache.subject, "%opportunity%"),
      ilike(emailCache.subject, "%investment%"),
      ilike(emailCache.subject, "%guarantee%"),
      ilike(emailCache.subject, "%risk free%"),
      ilike(emailCache.subject, "%act now%"),
      ilike(emailCache.subject, "%limited time%"),
      ilike(emailCache.subject, "%expires%"),
      ilike(emailCache.subject, "%password%"),
      ilike(emailCache.subject, "%reset%"),
      ilike(emailCache.subject, "%security alert%"),
      ilike(emailCache.subject, "%login attempt%"),
      ilike(emailCache.subject, "%unusual activity%"),

      // Known spam/temp email domains
      ilike(emailCache.senderEmail, "%@tempmail%"),
      ilike(emailCache.senderEmail, "%@10minutemail%"),
      ilike(emailCache.senderEmail, "%@guerrillamail%"),
      ilike(emailCache.senderEmail, "%@mailinator%"),
      ilike(emailCache.senderEmail, "%@throwaway%"),
      ilike(emailCache.senderEmail, "%@fakeinbox%"),
      ilike(emailCache.senderEmail, "%@temp-mail%"),
      ilike(emailCache.senderEmail, "%@yopmail%"),

      // Adult/dating spam
      ilike(emailCache.subject, "%single%"),
      ilike(emailCache.subject, "%dating%"),
      ilike(emailCache.subject, "%meet%"),
      ilike(emailCache.subject, "%hookup%"),
      ilike(emailCache.subject, "%xxx%"),
      ilike(emailCache.subject, "%adult%"),

      // Weight loss/health spam
      ilike(emailCache.subject, "%weight loss%"),
      ilike(emailCache.subject, "%diet%"),
      ilike(emailCache.subject, "%miracle%"),
      ilike(emailCache.subject, "%supplement%"),
      ilike(emailCache.subject, "%viagra%"),
      ilike(emailCache.subject, "%pharmacy%"),
      ilike(emailCache.subject, "%medication%"),
    ];

    // Get all senders with unsubscribe patterns
    const unsubscribeSenders = await db
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
          or(...unsubscribePatterns),
          ...excludePersonalEmails
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(200);

    // Get all senders with delete patterns
    const deleteSenders = await db
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
          or(...deletePatterns),
          ...excludePersonalEmails
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .orderBy(desc(count()))
      .limit(200);

    // Get high-volume senders (10+ emails regardless of content)
    const bulkSenders = await db
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
          ...excludePersonalEmails
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .having(sql`count(*) >= 10`)
      .orderBy(desc(count()))
      .limit(100);

    const suggestions: Array<{
      sender: string | null;
      senderEmail: string | null;
      count: number;
      sampleSubject: string | null;
      lastReceived: Date | null;
      actionType: "unsubscribe" | "delete";
      reason: string;
    }> = [];

    const addedEmails = new Set<string>();

    // Add unsubscribe senders (3+ emails)
    for (const sender of unsubscribeSenders.filter(s => Number(s.count) >= 3)) {
      if (!sender.senderEmail || addedEmails.has(sender.senderEmail)) continue;
      addedEmails.add(sender.senderEmail);

      suggestions.push({
        sender: sender.sender,
        senderEmail: sender.senderEmail,
        count: Number(sender.count),
        sampleSubject: sender.sampleSubject,
        lastReceived: sender.lastReceived,
        actionType: "unsubscribe",
        reason: "Marketing/Newsletter",
      });
    }

    // Add delete senders (3+ emails)
    for (const sender of deleteSenders.filter(s => Number(s.count) >= 3)) {
      if (!sender.senderEmail || addedEmails.has(sender.senderEmail)) continue;
      addedEmails.add(sender.senderEmail);

      suggestions.push({
        sender: sender.sender,
        senderEmail: sender.senderEmail,
        count: Number(sender.count),
        sampleSubject: sender.sampleSubject,
        lastReceived: sender.lastReceived,
        actionType: "delete",
        reason: "Spam/Scam",
      });
    }

    // Add bulk senders not already categorized (10+ emails, high volume)
    for (const sender of bulkSenders) {
      if (!sender.senderEmail || addedEmails.has(sender.senderEmail)) continue;
      // Only add if they have 10+ emails and weren't already categorized
      if (Number(sender.count) >= 10) {
        addedEmails.add(sender.senderEmail);

        suggestions.push({
          sender: sender.sender,
          senderEmail: sender.senderEmail,
          count: Number(sender.count),
          sampleSubject: sender.sampleSubject,
          lastReceived: sender.lastReceived,
          actionType: "delete",
          reason: `High Volume (${Number(sender.count)} emails)`,
        });
      }
    }

    // Sort by count (most emails first)
    suggestions.sort((a, b) => b.count - a.count);

    return Response.json({
      suggestions: suggestions.slice(0, 200),
      total: suggestions.length,
      unsubscribeCount: suggestions.filter(s => s.actionType === "unsubscribe").length,
      deleteCount: suggestions.filter(s => s.actionType === "delete").length,
      totalEmailsAffected: suggestions.reduce((sum, s) => sum + s.count, 0),
    });
  } catch (error) {
    console.error("Suggestions error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Internal server error", details: errorMessage }, { status: 500 });
  }
}
