import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Gmail API scopes
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

/**
 * Create OAuth2 client for Gmail
 */
export function createGmailOAuthClient(redirectUri: string): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
}

/**
 * Get authorization URL for Gmail OAuth
 */
export function getGmailAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/accounts/callback/gmail`;
  const client = createGmailOAuthClient(redirectUri);

  return client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    state,
    prompt: "consent", // Always get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/accounts/callback/gmail`;
  const client = createGmailOAuthClient(redirectUri);

  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date!),
  };
}

/**
 * Refresh Gmail access token
 */
export async function refreshGmailToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/accounts/callback/gmail`;
  const client = createGmailOAuthClient(redirectUri);

  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh token");
  }

  return {
    accessToken: credentials.access_token,
    expiresAt: new Date(credentials.expiry_date!),
  };
}

/**
 * Get Gmail client with access token
 */
export function getGmailClient(accessToken: string) {
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/accounts/callback/gmail`;
  const client = createGmailOAuthClient(redirectUri);
  client.setCredentials({ access_token: accessToken });

  return google.gmail({ version: "v1", auth: client });
}

/**
 * Fetch emails from Gmail
 */
export async function fetchGmailEmails(
  accessToken: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    query?: string;
  } = {}
): Promise<{
  emails: GmailEmail[];
  nextPageToken?: string;
}> {
  const gmail = getGmailClient(accessToken);

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: options.maxResults || 50,
    pageToken: options.pageToken,
    q: options.query,
  });

  const messages = response.data.messages || [];

  const emails: GmailEmail[] = await Promise.all(
    messages.map(async (message) => {
      const fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });

      const headers = fullMessage.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || null;

      return {
        id: message.id!,
        threadId: fullMessage.data.threadId!,
        subject: getHeader("subject"),
        from: getHeader("from"),
        to: getHeader("to"),
        date: getHeader("date"),
        snippet: fullMessage.data.snippet || null,
        isRead: !fullMessage.data.labelIds?.includes("UNREAD"),
        labels: fullMessage.data.labelIds || [],
      };
    })
  );

  return {
    emails,
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Delete email from Gmail
 */
export async function deleteGmailEmail(
  accessToken: string,
  emailId: string
): Promise<void> {
  const gmail = getGmailClient(accessToken);

  await gmail.users.messages.trash({
    userId: "me",
    id: emailId,
  });
}

/**
 * Archive email from Gmail
 */
export async function archiveGmailEmail(
  accessToken: string,
  emailId: string
): Promise<void> {
  const gmail = getGmailClient(accessToken);

  await gmail.users.messages.modify({
    userId: "me",
    id: emailId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
}

/**
 * Get Gmail profile (email address)
 */
export async function getGmailProfile(accessToken: string): Promise<{
  emailAddress: string;
  messagesTotal: number;
}> {
  const gmail = getGmailClient(accessToken);

  const profile = await gmail.users.getProfile({ userId: "me" });

  return {
    emailAddress: profile.data.emailAddress!,
    messagesTotal: profile.data.messagesTotal || 0,
  };
}

// Types
export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  snippet: string | null;
  isRead: boolean;
  labels: string[];
}