import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts } from "@/lib/db/schema";
import { eq, inArray, or, ilike, and, desc, count, gte, lte } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const sender = searchParams.get("sender") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const accountIds = searchParams.get("accounts")?.split(",").filter(Boolean) || [];
    const page = parseInt(searchParams.get("page") || "0");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    // Build query conditions
    const conditions = [];

    // Filter by selected accounts
    if (accountIds.length > 0) {
      conditions.push(inArray(emailCache.accountId, accountIds));
    }

    // Search in subject, sender, snippet, or body preview
    if (query) {
      conditions.push(
        or(
          ilike(emailCache.subject, `%${query}%`),
          ilike(emailCache.sender, `%${query}%`),
          ilike(emailCache.senderEmail, `%${query}%`),
          ilike(emailCache.snippet, `%${query}%`),
          ilike(emailCache.bodyPreview, `%${query}%`)
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

    // Filter by date range
    if (startDate) {
      conditions.push(gte(emailCache.receivedAt, new Date(startDate)));
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(emailCache.receivedAt, endDateTime));
    }

    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count first
    const totalResult = await db
      .select({ count: count() })
      .from(emailCache)
      .where(whereClause);
    const total = totalResult[0]?.count || 0;

    // Get paginated results
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