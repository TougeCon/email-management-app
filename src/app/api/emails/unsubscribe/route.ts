import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailCache, emailAccounts } from "@/lib/db/schema";
import { eq, ilike, desc, and } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { senderEmail } = body;

    if (!senderEmail) {
      return Response.json({ error: "Sender email required" }, { status: 400 });
    }

    // Check if we already processed this sender (avoid duplicate unsubscribes)
    const existingProcessed = await db
      .select()
      .from(emailCache)
      .where(
        and(
          ilike(emailCache.senderEmail, senderEmail),
          ilike(emailCache.subject, "%unsubscribe processed%")
        )
      )
      .limit(1);

    if (existingProcessed.length > 0) {
      return Response.json({
        success: true,
        senderEmail,
        alreadyProcessed: true,
        message: "Already unsubscribed from this sender",
      });
    }

    // Find the most recent email from this sender that might have unsubscribe info
    const emails = await db
      .select({
        id: emailCache.id,
        accountId: emailCache.accountId,
        subject: emailCache.subject,
        snippet: emailCache.snippet,
        bodyPreview: emailCache.bodyPreview,
      })
      .from(emailCache)
      .where(ilike(emailCache.senderEmail, senderEmail))
      .orderBy(desc(emailCache.receivedAt))
      .limit(10);

    if (emails.length === 0) {
      return Response.json({ error: "No emails found from this sender" }, { status: 404 });
    }

    // Look for unsubscribe link in body preview or snippet
    let unsubscribeUrl: string | null = null;
    let emailToMark: { id: string; accountId: string } | null = null;

    for (const email of emails) {
      const text = (email.bodyPreview || email.snippet || "").toLowerCase();

      // Look for common unsubscribe URL patterns
      const urlPatterns = [
        /unsubscribe[=:]\s*https?:\/\/[^\s]+/i,
        /opt.out[=:]\s*https?:\/\/[^\s]+/i,
        /https?:\/\/[^\s]*unsubscribe[^\s]*/i,
      ];

      for (const pattern of urlPatterns) {
        const match = text.match(pattern);
        if (match) {
          // Extract the URL
          const urlMatch = match[0].match(/https?:\/\/[^\s]+/i);
          if (urlMatch) {
            unsubscribeUrl = urlMatch[0];
            emailToMark = { id: email.id, accountId: email.accountId };
            break;
          }
        }
      }

      if (unsubscribeUrl) break;
    }

    // If no URL found in cache, check provider directly for List-Unsubscribe header
    if (!unsubscribeUrl && emailToMark) {
      const accounts = await db.select().from(emailAccounts);
      const account = accounts.find((a) => a.id === emailToMark.accountId);

      if (account) {
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

            const message = await gmail.users.messages.get({
              userId: "me",
              id: emailToMark.id,
              format: "metadata",
              metadataHeaders: ["List-Unsubscribe"],
            });

            const headers = message.data.payload?.headers || [];
            const listUnsubscribe = headers.find(
              (h) => h.name === "List-Unsubscribe"
            )?.value;

            if (listUnsubscribe) {
              // Extract URL from List-Unsubscribe header
              const urlMatch = listUnsubscribe.match(/<([^>]+)>/);
              if (urlMatch && urlMatch[1]) {
                unsubscribeUrl = urlMatch[1];
              }
            }
          } else if (account.provider === "outlook") {
            const { Client } = await import("@microsoft/microsoft-graph-client");

            const graphClient = Client.init({
              authProvider: (done) => {
                done(null, accessToken);
              },
            });

            const msg: any = await graphClient
              .api(`/me/messages/${emailToMark.id}`)
              .select("internetMessageHeaders")
              .get();

            const headers = msg.internetMessageHeaders || [];
            const listUnsubscribe = headers.find(
              (h: any) => h.name === "List-Unsubscribe"
            )?.value;

            if (listUnsubscribe) {
              const urlMatch = listUnsubscribe.match(/<([^>]+)>/);
              if (urlMatch && urlMatch[1]) {
                unsubscribeUrl = urlMatch[1];
              }
            }
          }
        } catch (err) {
          console.error("Provider check failed:", err);
        }
      }
    }

    // Mark this sender as processed to avoid duplicate unsubscribes
    if (emailToMark) {
      await db
        .update(emailCache)
        .set({
          subject: emailToMark.id === emails[0]?.id
            ? (emails[0].subject ? `${emails[0].subject} - unsubscribe processed` : "unsubscribe processed")
            : "unsubscribe processed"
        })
        .where(eq(emailCache.id, emailToMark.id));
    }

    // Return the unsubscribe URL if found, or instructions
    return Response.json({
      success: true,
      senderEmail,
      unsubscribeUrl,
      alreadyProcessed: false,
      message: unsubscribeUrl
        ? "Unsubscribe link found"
        : "No direct unsubscribe link found. Check the email for unsubscribe instructions.",
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
