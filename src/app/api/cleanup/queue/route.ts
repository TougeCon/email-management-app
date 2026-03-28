import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletionQueue, emailCache, emailAccounts } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all items in deletion queue that haven't expired
    const now = new Date();
    const queue = await db
      .select({
        id: deletionQueue.id,
        accountId: deletionQueue.accountId,
        accountEmail: emailAccounts.emailAddress,
        providerEmailId: deletionQueue.providerEmailId,
        subject: deletionQueue.subject,
        sender: deletionQueue.sender,
        deletedAt: deletionQueue.deletedAt,
        restoreBefore: deletionQueue.restoreBefore,
      })
      .from(deletionQueue)
      .innerJoin(emailAccounts, eq(deletionQueue.accountId, emailAccounts.id))
      .where(gt(deletionQueue.restoreBefore, now));

    return Response.json({ queue });
  } catch (error) {
    console.error("Error fetching deletion queue:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}