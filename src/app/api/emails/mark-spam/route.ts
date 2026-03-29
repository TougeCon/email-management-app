import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

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

    let markedCount = 0;

    for (const email of emails) {
      const account = accounts.find((a) => a.id === email.accountId);
      if (!account) continue;

      const accessToken = decrypt(account.encryptedAccessToken);

      try {
        if (account.provider === "gmail") {
          // Gmail: Add spam label or move to Spam folder
          const { markGmailAsSpam } = await import("@/lib/email-providers/gmail");
          await markGmailAsSpam(accessToken, email.providerEmailId);
        } else if (account.provider === "outlook") {
          // Outlook: Move to Junk Email folder
          const { markOutlookAsSpam } = await import("@/lib/email-providers/outlook");
          await markOutlookAsSpam(accessToken, email.providerEmailId);
        } else if (account.provider === "aol") {
          // AOL: Mark as spam via IMAP flags
          const { markAolAsSpam } = await import("@/lib/email-providers/aol");
          await markAolAsSpam(account.emailAddress, accessToken, email.providerEmailId);
        }

        // Update local cache
        await db
          .update(emailCache)
          .set({ isSpam: true })
          .where(eq(emailCache.id, email.id));

        markedCount++;
      } catch (err) {
        console.error(`Failed to mark email as spam on ${account.provider}:`, err);
      }
    }

    return Response.json({
      success: true,
      markedAsSpam: markedCount,
    });
  } catch (error) {
    console.error("Mark spam error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
