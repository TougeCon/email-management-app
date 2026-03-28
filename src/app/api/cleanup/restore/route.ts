import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletionQueue, emailAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { itemId } = body;

    if (!itemId) {
      return Response.json({ error: "Item ID required" }, { status: 400 });
    }

    // Get the deletion queue item
    const item = await db
      .select()
      .from(deletionQueue)
      .where(eq(deletionQueue.id, itemId))
      .limit(1);

    if (item.length === 0) {
      return Response.json({ error: "Item not found" }, { status: 404 });
    }

    const queueItem = item[0];

    // Get the account to get the access token
    const account = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.id, queueItem.accountId))
      .limit(1);

    if (account.length === 0) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const emailAccount = account[0];
    const accessToken = decrypt(emailAccount.encryptedAccessToken);

    // Restore the email based on provider
    let restoreSuccess = false;

    if (queueItem.action === "delete") {
      // For Gmail and Outlook, we need to move from trash back to inbox
      if (emailAccount.provider === "gmail") {
        try {
          const { getGmailClient } = await import("@/lib/email-providers/gmail");
          const gmail = getGmailClient(accessToken);

          await gmail.users.messages.untrash({
            userId: "me",
            id: queueItem.providerEmailId,
          });

          // Move back to inbox
          await gmail.users.messages.modify({
            userId: "me",
            id: queueItem.providerEmailId,
            requestBody: {
              addLabelIds: ["INBOX"],
            },
          });

          restoreSuccess = true;
        } catch (err) {
          console.error("Gmail restore error:", err);
        }
      } else if (emailAccount.provider === "outlook") {
        // For Outlook, move from Deleted Items back to Inbox
        try {
          const { getGraphClient } = await import("@/lib/email-providers/outlook");
          const client = getGraphClient(accessToken);

          // Get inbox folder ID
          const inbox = await client
            .api("/me/mailFolders")
            .filter("displayName eq 'Inbox'")
            .get();

          const inboxId = inbox.value[0]?.id;

          if (inboxId) {
            await client.api(`/me/messages/${queueItem.providerEmailId}/move`).post({
              destinationId: inboxId,
            });
          }

          restoreSuccess = true;
        } catch (err) {
          console.error("Outlook restore error:", err);
        }
      }
    }

    if (restoreSuccess) {
      // Remove from deletion queue
      await db.delete(deletionQueue).where(eq(deletionQueue.id, itemId));

      return Response.json({ success: true });
    } else {
      return Response.json({ error: "Failed to restore email" }, { status: 500 });
    }
  } catch (error) {
    console.error("Error restoring email:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}