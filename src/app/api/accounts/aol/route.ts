import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { testAolConnection } from "@/lib/email-providers/aol";

// Add AOL account (uses app password)
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

    // Test connection first
    const testResult = await testAolConnection(email, password);
    if (!testResult.success) {
      return Response.json({
        error: `Connection failed: ${testResult.error}`
      }, { status: 400 });
    }

    // Create or update account
    const accountId = crypto.randomUUID();

    // Store the app password as the "access token" (encrypted)
    await db.insert(emailAccounts).values({
      id: accountId,
      provider: "aol",
      emailAddress: email,
      displayName: displayName || null,
      encryptedAccessToken: encrypt(password), // App password
      encryptedRefreshToken: null, // AOL doesn't use refresh tokens
      tokenExpiresAt: null, // App passwords don't expire
      isActive: true,
    });

    return Response.json({ success: true, accountId });
  } catch (error) {
    console.error("AOL account error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}