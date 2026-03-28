import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/tokenCredentialAuthenticationProvider/exports";
import { ConfidentialClientApplication } from "@azure/msal-node";

// Microsoft Graph API scopes
const GRAPH_SCOPES = ["https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Mail.ReadWrite"];

/**
 * Create MSAL client for Outlook OAuth
 */
export function createMsalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: "https://login.microsoftonline.com/consumers",
    },
  });
}

/**
 * Get authorization URL for Outlook OAuth
 */
export function getOutlookAuthUrl(state: string): string {
  const msalClient = createMsalClient();

  return msalClient.getAuthCodeUrl({
    scopes: GRAPH_SCOPES,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/accounts/callback/outlook`,
    state,
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeOutlookCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const msalClient = createMsalClient();

  const response = await msalClient.acquireTokenByCode({
    code,
    scopes: GRAPH_SCOPES,
    redirectUri: `${process.env.NEXTAUTH_URL}/api/accounts/callback/outlook`,
  });

  if (!response?.accessToken) {
    throw new Error("Failed to get tokens from Microsoft");
  }

  return {
    accessToken: response.accessToken,
    refreshToken: response.account?.homeAccountId || "",
    expiresAt: new Date(response.expiresOnTimestamp),
  };
}

/**
 * Refresh Outlook access token
 */
export async function refreshOutlookToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const msalClient = createMsalClient();

  const response = await msalClient.acquireTokenSilent({
    scopes: GRAPH_SCOPES,
    account: {
      homeAccountId: refreshToken,
    } as any,
  });

  if (!response?.accessToken) {
    throw new Error("Failed to refresh token");
  }

  return {
    accessToken: response.accessToken,
    expiresAt: new Date(response.expiresOnTimestamp),
  };
}

/**
 * Get Microsoft Graph client with access token
 */
export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

/**
 * Fetch emails from Outlook
 */
export async function fetchOutlookEmails(
  accessToken: string,
  options: {
    maxResults?: number;
    skip?: number;
    filter?: string;
  } = {}
): Promise<{
  emails: OutlookEmail[];
  nextLink?: string;
}> {
  const client = getGraphClient(accessToken);

  const response = await client
    .api("/me/messages")
    .select("id,subject,from,receivedDateTime,isRead,bodyPreview,internetMessageId")
    .orderby("receivedDateTime desc")
    .top(options.maxResults || 50)
    .skip(options.skip || 0)
    .filter(options.filter || "")
    .get();

  const emails: OutlookEmail[] = response.value.map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || null,
    from: msg.from?.emailAddress?.name || null,
    fromEmail: msg.from?.emailAddress?.address || null,
    receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
    isRead: msg.isRead,
    snippet: msg.bodyPreview || null,
    internetMessageId: msg.internetMessageId,
  }));

  return {
    emails,
    nextLink: response["@odata.nextLink"],
  };
}

/**
 * Delete email from Outlook
 */
export async function deleteOutlookEmail(
  accessToken: string,
  emailId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  await client.api(`/me/messages/${emailId}`).delete();
}

/**
 * Archive email from Outlook (move to archive folder)
 */
export async function archiveOutlookEmail(
  accessToken: string,
  emailId: string
): Promise<void> {
  const client = getGraphClient(accessToken);

  // Get archive folder ID
  const archiveFolder = await client
    .api("/me/mailFolders")
    .filter("displayName eq 'Archive'")
    .get();

  const archiveFolderId = archiveFolder.value[0]?.id;

  if (archiveFolderId) {
    await client.api(`/me/messages/${emailId}/move`).post({
      destinationId: archiveFolderId,
    });
  } else {
    // Fallback: mark as read and remove from inbox
    await client.api(`/me/messages/${emailId}`).patch({
      isRead: true,
    });
  }
}

/**
 * Get Outlook profile (email address)
 */
export async function getOutlookProfile(accessToken: string): Promise<{
  emailAddress: string;
  displayName: string;
}> {
  const client = getGraphClient(accessToken);

  const profile = await client.api("/me").select("mail,userPrincipalName,displayName").get();

  return {
    emailAddress: profile.mail || profile.userPrincipalName,
    displayName: profile.displayName,
  };
}

// Types
export interface OutlookEmail {
  id: string;
  subject: string | null;
  from: string | null;
  fromEmail: string | null;
  receivedAt: Date | null;
  isRead: boolean;
  snippet: string | null;
  internetMessageId?: string;
}