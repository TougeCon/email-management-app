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
    const error = searchParams.get("error");

    if (error) {
      return Response.redirect(new URL("/accounts?error=" + error, request.url));
    }

    if (!code) {
      return Response.redirect(new URL("/accounts?error=no_code", request.url));
    }

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
          encryptedRefreshToken: encrypt(tokens.refreshToken),
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
      displayName: profile.displayName || null,
      encryptedAccessToken: encrypt(tokens.accessToken),
      encryptedRefreshToken: encrypt(tokens.refreshToken),
      tokenExpiresAt: tokens.expiresAt,
      isActive: true,
    });

    return Response.redirect(new URL("/accounts?connected=outlook", request.url));
  } catch (error) {
    console.error("Outlook callback error:", error);
    return Response.redirect(new URL("/accounts?error=auth_failed", request.url));
  }
}

async function exchangeOutlookCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/accounts/callback/outlook`;

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

async function getOutlookProfile(accessToken: string): Promise<{
  emailAddress: string;
  displayName: string | null;
}> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Outlook profile");
  }

  const data = await response.json();

  return {
    emailAddress: data.mail || data.userPrincipalName,
    displayName: data.displayName,
  };
}
