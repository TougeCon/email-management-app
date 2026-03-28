import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts } from "@/lib/db/schema";
import { eq, inArray, or, ilike, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const sender = searchParams.get("sender") || "";
    const accountIds = searchParams.get("accounts")?.split(",").filter(Boolean) || [];
    const page = parseInt(searchParams.get("page") || "0");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    // Build query conditions
    const conditions = [];

    // Filter by selected accounts
    if (accountIds.length > 0) {
      conditions.push(inArray(emailCache.accountId, accountIds));
    }

    // Search in subject, sender, or snippet
    if (query) {
      conditions.push(
        or(
          ilike(emailCache.subject, `%${query}%`),
          ilike(emailCache.sender, `%${query}%`),
          ilike(emailCache.senderEmail, `%${query}%`),
          ilike(emailCache.snippet, `%${query}%`)
        )
      );
    }

    // Filter by sender
    if (sender) {
      conditions.push(
        or(
          ilike(emailCache.sender, `%${sender}%`),
          ilike(emailCache.senderEmail, `%${sender}%`)
        )
      );
    }

    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const emails = await db
      .select({
        id: emailCache.id,
        accountId: emailCache.accountId,
        subject: emailCache.subject,
        sender: emailCache.sender,
        senderEmail: emailCache.senderEmail,
        receivedAt: emailCache.receivedAt,
        isRead: emailCache.isRead,
        snippet: emailCache.snippet,
      })
      .from(emailCache)
      .where(whereClause)
      .orderBy(desc(emailCache.receivedAt))
      .limit(pageSize)
      .offset(page * pageSize);

    // Get total count (simplified - would need separate count query in production)
    const total = emails.length;

    return Response.json({
      emails,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Search error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}