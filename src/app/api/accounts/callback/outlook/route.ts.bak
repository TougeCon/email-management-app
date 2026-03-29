import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";

// Outlook OAuth callback
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.redirect(new URL("/login", request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return Response.redirect(new URL("/accounts?error=no_code", request.url));
    }

    // Import Outlook functions
    const { exchangeOutlookCode, getOutlookProfile } = await import("@/lib/email-providers/outlook");

    // Exchange code for tokens
    const tokens = await exchangeOutlookCode(code);

    // Get profile to verify email address
    const profile = await getOutlookProfile(tokens.accessToken);

    // Check if account already exists
    const existing = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.emailAddress, profile.emailAddress));

    if (existing.length > 0) {
      // Update existing account tokens
      await db
        .update(emailAccounts)
        .set({
          encryptedAccessToken: encrypt(tokens.accessToken),
          encryptedRefreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
          tokenExpiresAt: tokens.expiresAt,
          isActive: true,
        })
        .where(eq(emailAccounts.id, existing[0].id));

      return Response.redirect(new URL("/accounts?connected=outlook", request.url));
    }

    // Create new account
    const accountId = crypto.randomUUID();

    await db.insert(emailAccounts).values({
      id: accountId,
      provider: "outlook",
      emailAddress: profile.emailAddress,
      displayName: profile.displayName,
      encryptedAccessToken: encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      isActive: true,
    });

    return Response.redirect(new URL("/accounts?connected=outlook", request.url));
  } catch (error) {
    console.error("Outlook callback error:", error);
    return Response.redirect(new URL("/accounts?error=auth_failed", request.url));
  }
}