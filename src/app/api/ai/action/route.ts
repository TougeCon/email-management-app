import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts, deletionQueue } from "@/lib/db/schema";
import { eq, ilike, and, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, senderEmail, senderEmails, subject, keyword, accountIds = [] } = body;

    if (!action || !["delete", "mark_spam", "archive"].includes(action)) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    // Build conditions to find matching emails
    const conditions = [];

    // Support single sender or multiple senders
    if (senderEmail) {
      conditions.push(ilike(emailCache.senderEmail, `%${senderEmail}%`));
    }

    if (senderEmails && senderEmails.length > 1) {
      const senderConditions = senderEmails.map((email: string) =>
        ilike(emailCache.senderEmail, `%${email}%`)
      );
      // Use OR for multiple senders
      const orModule = await import("drizzle-orm");
      conditions.push(orModule.or(...senderConditions));
    }

    if (subject) {
      conditions.push(ilike(emailCache.subject, `%${subject}%`));
    }

    if (keyword) {
      // Search in bodyPreview for keyword matches
      conditions.push(ilike(emailCache.bodyPreview, `%${keyword}%`));
    }

    if (accountIds.length > 0) {
      conditions.push(inArray(emailCache.accountId, accountIds));
    }

    if (conditions.length === 0) {
      return Response.json({ error: "No search criteria provided" }, { status: 400 });
    }

    // Find matching emails (high limit for bulk operations - up to 20000)
    const emails = await db
      .select({
        id: emailCache.id,
        accountId: emailCache.accountId,
        providerEmailId: emailCache.providerEmailId,
        subject: emailCache.subject,
        sender: emailCache.sender,
        senderEmail: emailCache.senderEmail,
      })
      .from(emailCache)
      .where(and(...conditions))
      .limit(20000);

    if (emails.length === 0) {
      return Response.json({ error: "No matching emails found" }, { status: 404 });
    }

    // Get accounts for provider-specific actions
    const uniqueAccountIds = [...new Set(emails.map((e) => e.accountId))];
    const accounts = await db
      .select()
      .from(emailAccounts)
      .where(inArray(emailAccounts.id, uniqueAccountIds));

    let processedCount = 0;
    let errors: string[] = [];

    for (const email of emails) {
      const account = accounts.find((a) => a.id === email.accountId);
      if (!account) continue;

      try {
        if (action === "mark_spam") {
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
          await db.update(emailCache).set({ isSpam: true }).where(eq(emailCache.id, email.id));
          processedCount++;

        } else if (action === "delete") {
          // Add to deletion queue (24-hour undo window)
          await db.insert(deletionQueue).values({
            id: uuidv4(),
            accountId: email.accountId,
            providerEmailId: email.providerEmailId,
            subject: email.subject,
            sender: email.sender,
            deletedAt: new Date(),
            restoreBefore: new Date(Date.now() + 24 * 60 * 60 * 1000),
            action: "delete",
          });
          processedCount++;

        } else if (action === "archive") {
          // For now, just mark as processed in cache
          // Could implement provider-specific archive later
          await db.update(emailCache).set({ folder: "Archive" }).where(eq(emailCache.id, email.id));
          processedCount++;
        }
      } catch (err) {
        console.error(`Failed to ${action} email:`, err);
        errors.push(`Failed to ${action} "${email.subject || "(no subject)"}"`);
      }
    }

    return Response.json({
      success: true,
      action,
      processedCount,
      totalFound: emails.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("AI action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
