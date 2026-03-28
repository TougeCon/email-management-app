// Email Provider Types
export type EmailProvider = "gmail" | "outlook" | "aol";

export interface EmailMessage {
  id: string;
  accountId: string;
  provider: EmailProvider;
  providerEmailId: string;
  subject: string | null;
  sender: string | null;
  senderEmail: string | null;
  receivedAt: Date | null;
  isRead: boolean;
  folder: string | null;
  labels: string[] | null;
  snippet: string | null;
  body?: string;
  hasAttachments?: boolean;
}

export interface EmailAccountInfo {
  id: string;
  provider: EmailProvider;
  emailAddress: string;
  displayName: string | null;
  isActive: boolean;
  lastSyncedAt: Date | null;
}

// Search Types
export interface SearchFilters {
  query?: string;
  senders?: string[];
  subjects?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  isRead?: boolean;
  hasAttachments?: boolean;
  accountIds?: string[];
  folders?: string[];
  labels?: string[];
}

export interface SearchResult {
  emails: EmailMessage[];
  total: number;
  page: number;
  pageSize: number;
}

// Cleanup Rules Types
export interface CleanupRuleCondition {
  senderPatterns?: string[];
  subjectKeywords?: string[];
  hasAttachment?: boolean;
  olderThanDays?: number;
}

export interface CleanupRuleAction {
  type: "delete" | "archive" | "mark_spam";
}

// AI Chat Types
export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface AIQueryContext {
  emailMetadata: {
    totalEmails: number;
    topSenders: { email: string; count: number }[];
    recentEmails: {
      subject: string;
      sender: string;
      date: Date;
    }[];
    accounts: {
      email: string;
      provider: string;
      emailCount: number;
    }[];
  };
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// OAuth Token Types
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

// Account Group Types
export interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[];
  createdAt: Date;
}