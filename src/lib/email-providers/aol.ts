import { ImapFlow } from "imapflow";

/**
 * Create AOL IMAP client
 */
export function createAolClient(email: string, appPassword: string): ImapFlow {
  return new ImapFlow({
    host: "imap.aol.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });
}

/**
 * Mark email as spam in AOL (move to Spam folder)
 */
export async function markAolAsSpam(
  email: string,
  appPassword: string,
  uid: string
): Promise<void> {
  const client = createAolClient(email, appPassword);

  try {
    await client.connect();

    // Open INBOX where the email currently is
    await client.mailboxOpen("INBOX");

    // Move the message to Spam folder using sequence number
    // Note: This is a simplified approach - for production, fetch UID first
    const seqNum = parseInt(uid);
    await client.messageMove([seqNum], "Spam");
  } finally {
    await client.logout();
  }
}

/**
 * Fetch emails from AOL IMAP
 */
export async function fetchAolEmails(
  email: string,
  appPassword: string,
  options: {
    maxResults?: number;
    folder?: string;
  } = {}
): Promise<{
  emails: AolEmail[];
}> {
  const client = createAolClient(email, appPassword);

  try {
    await client.connect();
    await client.mailboxOpen(options.folder || "INBOX");

    const emails: AolEmail[] = [];
    const maxFetch = options.maxResults || 100;

    const messages = await client.fetch(`1:${maxFetch}`, { envelope: true, uid: true });

    for await (const message of messages) {
      emails.push({
        id: message.uid?.toString() || Date.now().toString(),
        subject: message.envelope?.subject || null,
        from: message.envelope?.from?.[0]?.address || null,
        date: message.envelope?.date ? new Date(message.envelope.date) : null,
        isRead: !message.flags?.has("\\Seen"),
      });
    }

    return { emails };
  } finally {
    await client.logout();
  }
}

// Types
export interface AolEmail {
  id: string;
  subject: string | null;
  from: string | null;
  date: Date | null;
  isRead: boolean;
}
