import type { AIQueryContext } from "@/types";

interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  context?: number[];
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Get the Ollama API URL from environment
 */
function getOllamaUrl(): string {
  return process.env.OLLAMA_API_URL || "http://localhost:11434";
}

/**
 * Get the model name from environment
 */
function getModelName(): string {
  return process.env.OLLAMA_MODEL || "glm5:cloud";
}

/**
 * Send a prompt to Ollama and get a response
 */
export async function queryOllama(prompt: string): Promise<string> {
  const url = `${getOllamaUrl()}/api/generate`;

  const request: OllamaRequest = {
    model: getModelName(),
    prompt,
    stream: false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const data: OllamaResponse = await response.json();

  return data.response;
}

/**
 * Build a context string for the AI from email metadata
 */
export function buildEmailContext(context: AIQueryContext): string {
  const { emailMetadata } = context;

  let contextStr = `You have access to the following email metadata:\n\n`;
  contextStr += `Total emails cached: ${emailMetadata.totalEmails}\n\n`;

  contextStr += `Connected accounts:\n`;
  for (const account of emailMetadata.accounts) {
    contextStr += `- ${account.email} (${account.provider}): ${account.emailCount} emails\n`;
  }
  contextStr += `\n`;

  contextStr += `Top senders by volume:\n`;
  for (const sender of emailMetadata.topSenders.slice(0, 10)) {
    contextStr += `- ${sender.email}: ${sender.count} emails\n`;
  }
  contextStr += `\n`;

  contextStr += `Recent emails:\n`;
  for (const email of emailMetadata.recentEmails.slice(0, 5)) {
    contextStr += `- "${email.subject}" from ${email.sender} (${email.date.toDateString()})\n`;
  }

  return contextStr;
}

/**
 * Generate a prompt for email-related queries
 */
export function generateEmailQueryPrompt(
  userQuery: string,
  context: AIQueryContext
): string {
  const emailContext = buildEmailContext(context);

  return `You are an AI assistant helping a user manage their emails. You have access to metadata about their emails but not the actual content for privacy reasons.

${emailContext}

The user asks: "${userQuery}"

Please provide a helpful response. If they're asking about emails, summarize what you know from the metadata. If they want to take action (like delete or archive), suggest what they might want to do. Be concise and helpful.

If the query asks you to find specific emails, describe what patterns you see in the metadata that might help them find those emails.

Response:`;
}

/**
 * Parse a natural language query and extract search parameters
 */
export function parseNaturalLanguageQuery(query: string): {
  keywords: string[];
  senders: string[];
  timeRange?: { start?: Date; end?: Date };
  actions: string[];
} {
  const lowerQuery = query.toLowerCase();

  const result = {
    keywords: [] as string[],
    senders: [] as string[],
    timeRange: {} as { start?: Date; end?: Date },
    actions: [] as string[],
  };

  // Extract email addresses
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const emails = query.match(emailRegex);
  if (emails) {
    result.senders = emails;
  }

  // Extract time ranges
  if (lowerQuery.includes("today")) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    result.timeRange.start = today;
  } else if (lowerQuery.includes("yesterday")) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    result.timeRange.start = yesterday;
    result.timeRange.end = endOfYesterday;
  } else if (lowerQuery.includes("week")) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    result.timeRange.start = weekAgo;
  } else if (lowerQuery.includes("month")) {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    result.timeRange.start = monthAgo;
  }

  // Extract actions
  if (lowerQuery.includes("delete")) {
    result.actions.push("delete");
  }
  if (lowerQuery.includes("archive")) {
    result.actions.push("archive");
  }
  if (lowerQuery.includes("unsubscribe")) {
    result.actions.push("unsubscribe");
  }

  // Extract keywords (simple extraction - remove common words)
  const commonWords = [
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
    "although",
    "though",
    "after",
    "before",
    "when",
    "whenever",
    "email",
    "emails",
    "find",
    "show",
    "me",
    "my",
    "i",
    "want",
    "get",
  ];

  const words = query
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !commonWords.includes(word));

  result.keywords = [...new Set(words)];

  return result;
}