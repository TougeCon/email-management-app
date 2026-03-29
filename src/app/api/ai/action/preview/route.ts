import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { eq, ilike, and, inArray, or, count } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, senderEmail, senderEmails, subject, keyword, accountIds = [] } = body;

    // Build conditions to find matching emails
    const conditions = [];

    if (senderEmail) {
      conditions.push(ilike(emailCache.senderEmail, `%${senderEmail}%`));
    }

    if (senderEmails && senderEmails.length > 1) {
      const senderConditions = senderEmails.map((email: string) =>
        ilike(emailCache.senderEmail, `%${email}%`)
      );
      conditions.push(or(...senderConditions));
    }

    if (subject) {
      conditions.push(ilike(emailCache.subject, `%${subject}%`));
    }

    if (keyword) {
      conditions.push(ilike(emailCache.bodyPreview, `%${keyword}%`));
    }

    if (accountIds.length > 0) {
      conditions.push(inArray(emailCache.accountId, accountIds));
    }

    if (conditions.length === 0) {
      return Response.json({ error: "No search criteria provided" }, { status: 400 });
    }

    // Count matching emails
    const result = await db
      .select({ count: count() })
      .from(emailCache)
      .where(and(...conditions));

    return Response.json({ count: result[0]?.count || 0 });
  } catch (error) {
    console.error("Action preview error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
