import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletionQueue, emailAccounts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all deletion queue items
    const queueItems = await db
      .select()
      .from(deletionQueue)
      .orderBy(desc(deletionQueue.deletedAt));

    if (queueItems.length === 0) {
      return Response.json({ message: "No items in deletion queue" });
    }

    let restoredCount = 0;
    let failedCount = 0;

    for (const queueItem of queueItems) {
      try {
        // Get the account to get the access token
        const account = await db
          .select()
          .from(emailAccounts)
          .where(eq(emailAccounts.id, queueItem.accountId))
          .limit(1);

        if (account.length === 0) {
          failedCount++;
          continue;
        }

        const emailAccount = account[0];
        const accessToken = decrypt(emailAccount.encryptedAccessToken);

        let restoreSuccess = false;

        if (queueItem.action === "delete") {
          // For Gmail, move from trash back to inbox
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
            // Outlook restore - move from deleted items back to inbox
            try {
              const { Client } = await import("@microsoft/microsoft-graph-client");
              const graphClient = Client.init({
                authProvider: (done) => {
                  done(null, accessToken);
                },
              });

              await graphClient
                .api(`/me/messages/${queueItem.providerEmailId}/move`)
                .post({
                  destinationId: "inbox",
                });

              restoreSuccess = true;
            } catch (err) {
              console.error("Outlook restore error:", err);
            }
          } else {
            // AOL or other - just remove from queue
            restoreSuccess = true;
          }
        }

        if (restoreSuccess) {
          // Remove from deletion queue
          await db.delete(deletionQueue).where(eq(deletionQueue.id, queueItem.id));
          restoredCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error("Error restoring email:", err);
        failedCount++;
      }
    }

    return Response.json({
      success: true,
      restoredCount,
      failedCount,
      totalProcessed: queueItems.length,
    });
  } catch (error) {
    console.error("Error restoring all emails:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
