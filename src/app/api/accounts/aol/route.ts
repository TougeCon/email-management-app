import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, password, displayName } = body;

    if (!email || !password) {
      return Response.json({ error: "Email and password required" }, { status: 400 });
    }

    // Validate AOL email format
    if (!email.toLowerCase().includes("@aol.com") && !email.toLowerCase().includes("@aim.com")) {
      return Response.json({ error: "Must be a valid AOL or AIM email address" }, { status: 400 });
    }

    // Check if account already exists
    const existing = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.emailAddress, email));

    if (existing.length > 0) {
      // Update existing account with new credentials
      await db
        .update(emailAccounts)
        .set({
          encryptedAccessToken: encrypt(password), // For AOL, password is used as access token
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          displayName: displayName || existing[0].displayName,
          isActive: true,
        })
        .where(eq(emailAccounts.id, existing[0].id));

      return Response.json({ success: true, accountId: existing[0].id });
    }

    // Create new account
    const accountId = uuidv4();

    await db.insert(emailAccounts).values({
      id: accountId,
      provider: "aol",
      emailAddress: email,
      displayName: displayName || null,
      encryptedAccessToken: encrypt(password), // For AOL, store app password as access token
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      isActive: true,
    });

    return Response.json({ success: true, accountId });
  } catch (error) {
    console.error("AOL account error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
