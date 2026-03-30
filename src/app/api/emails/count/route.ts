import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache } from "@/lib/db/schema";
import { count, eq, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (accountId) {
      // Count for specific account
      const result = await db
        .select({ count: count() })
        .from(emailCache)
        .where(eq(emailCache.accountId, accountId));

      return Response.json({ count: result[0]?.count || 0 });
    } else {
      // Count for all accounts
      const result = await db
        .select({ count: count() })
        .from(emailCache);

      return Response.json({ count: result[0]?.count || 0 });
    }
  } catch (error) {
    console.error("Email count error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
