import Imap from "imap";
import { simpleParser } from "mailparser";

// AOL IMAP configuration
const AOL_IMAP_HOST = "imap.aol.com";
const AOL_IMAP_PORT = 993;

/**
 * Create IMAP connection for AOL
 */
export function createAolImapConnection(email: string, password: string): Imap {
  return new Imap({
    user: email,
    password: password, // App password
    host: AOL_IMAP_HOST,
    port: AOL_IMAP_PORT,
    tls: true,
    tlsOptions: { rejectUnauthorized: true },
  });
}

/**
 * Test AOL connection
 */
export async function testAolConnection(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const imap = createAolImapConnection(email, password);

    imap.once("ready", () => {
      imap.end();
      resolve({ success: true });
    });

    imap.once("error", (err: Error) => {
      resolve({ success: false, error: err.message });
    });

    imap.connect();
  });
}

/**
 * Fetch emails from AOL via IMAP
 */
export async function fetchAolEmails(
  email: string,
  password: string,
  options: {
    folder?: string;
    maxResults?: number;
    offset?: number;
  } = {}
): Promise<{ emails: AolEmail[] }> {
  return new Promise((resolve, reject) => {
    const imap = createAolImapConnection(email, password);
    const emails: AolEmail[] = [];
    const folder = options.folder || "INBOX";
    const maxResults = options.maxResults || 50;

    imap.once("ready", () => {
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        if (box.messages.total === 0) {
          imap.end();
          return resolve({ emails: [] });
        }

        const start = box.messages.total - (options.offset || 0);
        const end = Math.max(start - maxResults + 1, 1);

        const fetch = imap.seq.fetch(`${end}:${start}`, {
          bodies: ["HEADER", "TEXT"],
          struct: true,
        });

        fetch.on("message", (msg) => {
          let headers: any = {};
          let body = "";

          msg.on("body", (stream, info) => {
            let buffer = "";

            stream.on("data", (chunk: Buffer) => {
              buffer += chunk.toString("utf8");
            });

            stream.once("end", () => {
              if (info.which === "HEADER") {
                headers = Imap.parseHeader(buffer);
              } else {
                body = buffer;
              }
            });
          });

          msg.once("end", () => {
            const parsed = simpleParser(body + headers, (err, parsed) => {
              if (err) return;

              emails.push({
                id: msg.uid?.toString() || "",
                subject: parsed?.subject || null,
                from: parsed?.from?.text || null,
                fromEmail: parsed?.from?.value?.[0]?.address || null,
                receivedAt: parsed?.date || null,
                isRead: !msg.flags?.includes("\\Seen"),
                snippet: parsed?.text?.substring(0, 200) || null,
                flags: msg.flags || [],
              });
            });
          });
        });

        fetch.once("error", (err) => {
          imap.end();
          reject(err);
        });

        fetch.once("end", () => {
          imap.end();
          resolve({ emails });
        });
      });
    });

    imap.once("error", (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Delete email from AOL (move to Trash)
 */
export async function deleteAolEmail(
  email: string,
  password: string,
  uid: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = createAolImapConnection(email, password);

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        imap.addMessageFlags(uid, ["\\Deleted"], (err) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          imap.expunge((err) => {
            imap.end();
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });

    imap.once("error", (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Archive email from AOL (move to Archive folder)
 */
export async function archiveAolEmail(
  email: string,
  password: string,
  uid: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = createAolImapConnection(email, password);

    imap.once("ready", () => {
      // First, find Archive folder
      imap.getBoxes((err, boxes) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        let archiveFolder = "Archive";
        for (const name of Object.keys(boxes)) {
          if (name.toLowerCase() === "archive") {
            archiveFolder = name;
            break;
          }
        }

        imap.openBox("INBOX", false, (err) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          imap.move(uid, archiveFolder, (err) => {
            imap.end();
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });

    imap.once("error", (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// Types
export interface AolEmail {
  id: string;
  subject: string | null;
  from: string | null;
  fromEmail: string | null;
  receivedAt: Date | null;
  isRead: boolean;
  snippet: string | null;
  flags: string[];
}