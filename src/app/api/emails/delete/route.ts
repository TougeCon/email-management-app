import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletionQueue, emailAccounts, emailCache } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emailIds } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return Response.json({ error: "Email IDs required" }, { status: 400 });
    }

    // Get the email entries from cache
    const emails = await db
      .select({
        id: emailCache.id,
        accountId: emailCache.accountId,
        providerEmailId: emailCache.providerEmailId,
        subject: emailCache.subject,
        sender: emailCache.sender,
      })
      .from(emailCache)
      .where(inArray(emailCache.id, emailIds));

    if (emails.length === 0) {
      return Response.json({ error: "No valid emails found" }, { status: 404 });
    }

    // Get accounts with their access tokens
    const accountIds = [...new Set(emails.map((e) => e.accountId))];
    const accounts = await db
      .select()
      .from(emailAccounts)
      .where(inArray(emailAccounts.id, accountIds));

    // Delete from provider and add to deletion queue
    const queueItems = [];

    for (const email of emails) {
      const account = accounts.find((a) => a.id === email.accountId);
      if (!account) continue;

      const accessToken = decrypt(account.encryptedAccessToken);

      // Delete from provider
      try {
        if (account.provider === "gmail") {
          const { deleteGmailEmail } = await import("@/lib/email-providers/gmail");
          await deleteGmailEmail(accessToken, email.providerEmailId);
        } else if (account.provider === "outlook") {
          const { deleteOutlookEmail } = await import("@/lib/email-providers/outlook");
          await deleteOutlookEmail(accessToken, email.providerEmailId);
        }
        // AOL - not yet implemented, skip provider deletion
      } catch (err) {
        console.error(`Failed to delete email from ${account.provider}:`, err);
        // Continue anyway - add to queue
      }

      // Add to deletion queue (24 hour restore window)
      const queueItem = {
        id: uuidv4(),
        accountId: email.accountId,
        providerEmailId: email.providerEmailId,
        subject: email.subject,
        sender: email.sender,
        restoreBefore: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        action: "delete" as const,
      };

      queueItems.push(queueItem);

      await db.insert(deletionQueue).values(queueItem);
    }

    return Response.json({
      success: true,
      deleted: emails.length,
      queued: queueItems.length,
    });
  } catch (error) {
    console.error("Delete error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
