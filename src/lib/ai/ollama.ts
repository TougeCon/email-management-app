import type { AIQueryContext } from "@/types";

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
}

/**
 * Get the AI API URL from environment
 * Default to Groq API which works reliably from Railway
 */
function getApiUrl(): string {
  return process.env.AI_API_URL || "https://api.groq.com/openai/v1/chat/completions";
}

/**
 * Get the API key from environment
 */
function getApiKey(): string {
  return process.env.AI_API_KEY || process.env.GROQ_API_KEY || "";
}

/**
 * Get the model name from environment
 */
function getModelName(): string {
  return process.env.AI_MODEL || process.env.GROQ_MODEL || "llama3-8b-8192";
}

/**
 * Send a prompt to AI API and get a response
 * Uses Groq API by default (fast, free tier, works from Railway)
 */
export async function queryOllama(prompt: string): Promise<string> {
  const url = getApiUrl();
  const apiKey = getApiKey();
  const model = getModelName();

  console.log(`[AI] Using model: ${model}, URL: ${url}, API key configured: ${!!apiKey}`);

  // Check if API key is configured
  if (!apiKey) {
    console.error("[AI] No API key configured");
    return "AI is not configured. Please set AI_API_KEY or GROQ_API_KEY in Railway environment variables.";
  }

  const request = {
    model,
    messages: [
      {
        role: "system",
        content: "You are an AI assistant helping a user manage their emails. Be concise and helpful. You have access to email metadata but not actual email content for privacy reasons."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    });

    console.log(`[AI] Response status: ${response.status}`);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[AI] API error: ${response.status} - ${error}`);
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`[AI] Response received, length: ${content?.length || 0}`);

    return content || "No response from AI";
  } catch (error) {
    if (error instanceof Error) {
      if (error.cause && (error.cause as any).code === 'ECONNREFUSED') {
        console.error("[AI] Connection refused - check network/firewall");
        return "Cannot connect to AI service. This may be a network issue.";
      }
      if (error.name === 'TimeoutError') {
        console.error("[AI] Request timed out");
        return "AI request timed out. Please try again.";
      }
    }
    throw error;
  }
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

  contextStr += `Recent emails (includes body previews for content search):\n`;
  for (const email of emailMetadata.recentEmails.slice(0, 10)) {
    const bodySnippet = email.bodyPreview ? ` [body: "${email.bodyPreview.slice(0, 80)}..."]` : "";
    contextStr += `- "${email.subject}" from ${email.sender} <${email.senderEmail}> (${email.date.toDateString()})${bodySnippet}\n`;
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
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
    "from", "as", "into", "through", "during", "before", "after", "above",
    "below", "under", "again", "further", "then", "once", "here", "there",
    "when", "where", "why", "how", "all", "each", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "and", "but", "if", "or",
    "because", "until", "while", "although", "though", "email", "emails",
    "find", "show", "me", "my", "i", "want", "get",
  ];

  const words = query
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !commonWords.includes(word));

  result.keywords = [...new Set(words)];

  return result;
}
