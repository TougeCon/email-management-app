import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";

// Microsoft Graph API scopes
const GRAPH_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
];

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
