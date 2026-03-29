import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanupRules, emailCache, emailAccounts, deletionQueue } from "@/lib/db/schema";
import { eq, and, or, ilike, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ruleId, applyToExisting = false } = body;

    // Get active rules
    const rules = ruleId
      ? await db.select().from(cleanupRules).where(eq(cleanupRules.id, ruleId))
      : await db.select().from(cleanupRules).where(eq(cleanupRules.isActive, true));

    if (rules.length === 0) {
      return Response.json({ error: "No active rules found" }, { status: 404 });
    }

    const results = [];

    for (const rule of rules) {
      if (!applyToExisting) {
        // Rule will be applied on next sync
        results.push({
          ruleName: rule.name,
          status: "active",
          message: "Rule will be applied to new emails during sync",
        });
        continue;
      }

      // Apply to existing emails
      const conditions = [];

      // Build query conditions from rule
      if (rule.conditions?.senderPatterns?.length) {
        const senderConditions = rule.conditions.senderPatterns.map((pattern: string) =>
          ilike(emailCache.senderEmail, `%${pattern}%`)
        );
        conditions.push(or(...senderConditions));
      }

      if (rule.conditions?.subjectKeywords?.length) {
        const subjectConditions = rule.conditions.subjectKeywords.map((keyword: string) =>
          ilike(emailCache.subject, `%${keyword}%`)
        );
        conditions.push(or(...subjectConditions));
      }

      if (conditions.length === 0) {
        results.push({
          ruleName: rule.name,
          status: "skipped",
          message: "No conditions defined",
        });
        continue;
      }

      // Find matching emails
      const matchingEmails = await db
        .select({
          id: emailCache.id,
          accountId: emailCache.accountId,
          providerEmailId: emailCache.providerEmailId,
          subject: emailCache.subject,
          sender: emailCache.sender,
        })
        .from(emailCache)
        .where(and(...conditions))
        .limit(1000); // Safety limit

      if (matchingEmails.length === 0) {
        results.push({
          ruleName: rule.name,
          status: "no_matches",
          message: "No existing emails match this rule",
        });
        continue;
      }

      // Get accounts for provider-specific actions
      const accountIds = [...new Set(matchingEmails.map((e) => e.accountId))];
      const accounts = await db
        .select()
        .from(emailAccounts)
        .where(inArray(emailAccounts.id, accountIds));

      let processedCount = 0;

      for (const email of matchingEmails) {
        const account = accounts.find((a) => a.id === email.accountId);
        if (!account) continue;

        try {
          if (rule.action === "mark_spam") {
            const accessToken = decrypt(account.encryptedAccessToken);

            if (account.provider === "gmail") {
              const { markGmailAsSpam } = await import("@/lib/email-providers/gmail");
              await markGmailAsSpam(accessToken, email.providerEmailId);
            } else if (account.provider === "outlook") {
              const { markOutlookAsSpam } = await import("@/lib/email-providers/outlook");
              await markOutlookAsSpam(accessToken, email.providerEmailId);
            } else if (account.provider === "aol") {
              const { markAolAsSpam } = await import("@/lib/email-providers/aol");
              await markAolAsSpam(account.emailAddress, accessToken, email.providerEmailId);
            }

            // Update local cache
            await db
              .update(emailCache)
              .set({ isSpam: true })
              .where(eq(emailCache.id, email.id));

            processedCount++;
          } else if (rule.action === "delete") {
            // Add to deletion queue
            await db.insert(deletionQueue).values({
              id: uuidv4(),
              accountId: email.accountId,
              providerEmailId: email.providerEmailId,
              subject: email.subject,
              sender: email.sender,
              restoreBefore: new Date(Date.now() + 24 * 60 * 60 * 1000),
              action: "delete",
            });
            processedCount++;
          } else if (rule.action === "archive") {
            // For archive, just mark as processed (could implement provider-specific archive)
            processedCount++;
          }
        } catch (err) {
          console.error(`Failed to apply rule to email:`, err);
        }
      }

      results.push({
        ruleName: rule.name,
        status: "applied",
        action: rule.action,
        matchedEmails: matchingEmails.length,
        processedCount,
      });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("Apply rules error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
