import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await db.select().from(emailAccounts);

    // Remove sensitive token data
    const safeAccounts = accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      emailAddress: account.emailAddress,
      displayName: account.displayName,
      isActive: account.isActive,
      lastSyncedAt: account.lastSyncedAt,
      createdAt: account.createdAt,
    }));

    return Response.json({ accounts: safeAccounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, emailAddress, accessToken, refreshToken, expiresAt, displayName } = body;

    if (!provider || !emailAddress || !accessToken) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if account already exists
    const existing = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.emailAddress, emailAddress));

    if (existing.length > 0) {
      // Update existing account
      await db
        .update(emailAccounts)
        .set({
          encryptedAccessToken: encrypt(accessToken),
          encryptedRefreshToken: refreshToken ? encrypt(refreshToken) : null,
          tokenExpiresAt: expiresAt ? new Date(expiresAt) : null,
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
      provider,
      emailAddress,
      displayName: displayName || null,
      encryptedAccessToken: encrypt(accessToken),
      encryptedRefreshToken: refreshToken ? encrypt(refreshToken) : null,
      tokenExpiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    });

    return Response.json({ success: true, accountId });
  } catch (error) {
    console.error("Error creating account:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("id");

    if (!accountId) {
      return Response.json({ error: "Account ID required" }, { status: 400 });
    }

    // Delete account (cascade will delete related emails)
    await db.delete(emailAccounts).where(eq(emailAccounts.id, accountId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}