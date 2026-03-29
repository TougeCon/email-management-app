import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts } from "@/lib/db/schema";
import { desc, count, eq, or, ilike, and, not, gt } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 1: Find candidate senders based on common newsletter/marketing patterns
    // These are heuristic - we look for senders who send lots of emails
    // with newsletter-like characteristics
    const marketingPatterns = [
      ilike(emailCache.subject, "%newsletter%"),
      ilike(emailCache.subject, "%promo%"),
      ilike(emailCache.subject, "%sale%"),
      ilike(emailCache.subject, "%offer%"),
      ilike(emailCache.subject, "%deal%"),
      ilike(emailCache.subject, "%weekly%"),
      ilike(emailCache.subject, "%daily%"),
      ilike(emailCache.subject, "%digest%"),
      ilike(emailCache.senderEmail, "%noreply%"),
      ilike(emailCache.senderEmail, "%no-reply%"),
      ilike(emailCache.senderEmail, "%newsletter%"),
      ilike(emailCache.senderEmail, "%marketing%"),
    ];

    // Get high-volume senders (3+ emails) - likely to be newsletters/marketing
    const highVolumeSenders = await db
      .select({
        senderEmail: emailCache.senderEmail,
        sender: emailCache.sender,
        count: count(),
        sampleSubject: emailCache.subject,
      })
      .from(emailCache)
      .where(
        and(
          or(...marketingPatterns),
          not(ilike(emailCache.senderEmail, "%@gmail.com")), // Exclude personal emails
          not(ilike(emailCache.senderEmail, "%@yahoo.com")),
          not(ilike(emailCache.senderEmail, "%@hotmail.com")),
          not(ilike(emailCache.senderEmail, "%@outlook.com")),
          not(ilike(emailCache.senderEmail, "%@aol.com"))
        )
      )
      .groupBy(emailCache.senderEmail, emailCache.sender)
      .having(({ count }) => gt(count, 2)) // At least 3 emails
      .orderBy(desc(count()))
      .limit(200);

    // Step 2: For each candidate sender, fetch full email body to check for unsubscribe
    const candidates = [];
    const accounts = await db.select().from(emailAccounts);

    for (const sender of highVolumeSenders) {
      if (!sender.senderEmail) continue;

      // Get recent emails from this sender
      const emails = await db
        .select({
          id: emailCache.id,
          accountId: emailCache.accountId,
          bodyPreview: emailCache.bodyPreview,
          snippet: emailCache.snippet,
        })
        .from(emailCache)
        .where(ilike(emailCache.senderEmail, sender.senderEmail))
        .orderBy(desc(emailCache.receivedAt))
        .limit(5);

      let hasUnsubscribe = false;
      let hasListUnsubscribe = false;

      // Check body previews and snippets for unsubscribe patterns
      for (const email of emails) {
        const text = ((email.bodyPreview || "") + (email.snippet || "")).toLowerCase();

        // Look for unsubscribe patterns (typically in footer)
        if (text.includes("unsubscribe") ||
            text.includes("opt-out") ||
            text.includes("opt out") ||
            text.includes("manage preferences") ||
            text.includes("email preferences") ||
            text.includes("update preferences")) {
          hasUnsubscribe = true;
        }

        // List-Unsubscribe header pattern
        if (text.includes("list-unsubscribe")) {
          hasListUnsubscribe = true;
        }
      }

      // If we didn't find unsubscribe in body, check provider directly for a sample
      if (!hasUnsubscribe && emails.length > 0) {
        try {
          const account = accounts.find((a) => a.id === emails[0].accountId);
          if (account) {
            const result = await checkProviderForUnsubscribe(account, emails[0]);
            hasUnsubscribe = result.hasUnsubscribe;
            hasListUnsubscribe = result.hasListUnsubscribe;
          }
        } catch (err) {
          console.error(`Failed to check provider for ${sender.senderEmail}:`, err);
        }
      }

      if (hasUnsubscribe || hasListUnsubscribe) {
        candidates.push({
          sender: sender.sender,
          senderEmail: sender.senderEmail,
          count: Number(sender.count),
          sampleSubject: sender.sampleSubject,
          hasListUnsubscribe,
          hasUnsubscribeLink: hasUnsubscribe,
        });
      }
    }

    // Sort by count (most emails first)
    candidates.sort((a, b) => b.count - a.count);

    return Response.json({
      candidates: candidates.slice(0, 100), // Top 100
      total: candidates.length,
    });
  } catch (error) {
    console.error("Unsubscribe candidates error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Check provider directly for unsubscribe info
async function checkProviderForUnsubscribe(
  account: any,
  email: { id: string; accountId: string }
) {
  try {
    const accessToken = decrypt(account.encryptedAccessToken);

    if (account.provider === "gmail") {
      const { google } = await import("googleapis");
      const { OAuth2Client } = await import("google-auth-library");

      const client = new OAuth2Client({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: client });

      // Get full message with headers
      const message = await gmail.users.messages.get({
        userId: "me",
        id: email.id,
        format: "metadata",
        metadataHeaders: ["List-Unsubscribe", "List-Unsubscribe-Post"],
      });

      const headers = message.data.payload?.headers || [];
      const listUnsubscribe = headers.find(
        (h) => h.name === "List-Unsubscribe"
      )?.value;

      return {
        hasListUnsubscribe: !!listUnsubscribe,
        hasUnsubscribe: !!listUnsubscribe || false,
      };
    } else if (account.provider === "outlook") {
      const { Client } = await import("@microsoft/microsoft-graph-client");

      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const msg: any = await graphClient
        .api(`/me/messages/${email.id}`)
        .select("internetMessageHeaders")
        .get();

      const headers = msg.internetMessageHeaders || [];
      const listUnsubscribe = headers.find(
        (h: any) => h.name === "List-Unsubscribe"
      )?.value;

      return {
        hasListUnsubscribe: !!listUnsubscribe,
        hasUnsubscribe: !!listUnsubscribe || false,
      };
    }
  } catch (err) {
    console.error("Provider check failed:", err);
  }

  return { hasListUnsubscribe: false, hasUnsubscribe: false };
}
