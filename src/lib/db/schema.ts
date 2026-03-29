import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// App Configuration (single user)
export const appConfig = pgTable("app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
});

// Connected Email Accounts
export const emailAccounts = pgTable("email_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // 'gmail' | 'outlook' | 'aol'
  emailAddress: text("email_address").notNull().unique(),
  displayName: text("display_name"),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  isActive: boolean("is_active").default(true).notNull(),
});

// Account Groups (for quick filtering)
export const accountGroups = pgTable("account_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Account Group Members
export const accountGroupMembers = pgTable("account_group_members", {
  groupId: uuid("group_id").notNull().references(() => accountGroups.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => emailAccounts.id, { onDelete: "cascade" }),
});

// Cached Email Metadata
export const emailCache = pgTable("email_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => emailAccounts.id, { onDelete: "cascade" }),
  providerEmailId: text("provider_email_id").notNull(),
  subject: text("subject"),
  sender: text("sender"),
  senderEmail: text("sender_email"),
  receivedAt: timestamp("received_at"),
  isRead: boolean("is_read").default(false),
  folder: text("folder"),
  labels: jsonb("labels").$type<string[]>(),
  snippet: text("snippet"),
  bodyPreview: text("body_preview"),
  isSpam: boolean("is_spam").default(false),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
}, (table) => ({
  idx_email_cache_account_id: index("idx_email_cache_account_id").on(table.accountId),
  idx_email_cache_received_at: index("idx_email_cache_received_at").on(table.receivedAt),
  idx_email_cache_sender_email: index("idx_email_cache_sender_email").on(table.senderEmail),
}));

// Cleanup Rules
export const cleanupRules = pgTable("cleanup_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  conditions: jsonb("conditions").notNull().$type<{
    senderPatterns?: string[];
    subjectKeywords?: string[];
    hasAttachment?: boolean;
    olderThanDays?: number;
  }>(),
  action: text("action").notNull(), // 'delete' | 'archive' | 'mark_spam'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deletion Queue (undo queue)
export const deletionQueue = pgTable("deletion_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => emailAccounts.id, { onDelete: "cascade" }),
  providerEmailId: text("provider_email_id").notNull(),
  subject: text("subject"),
  sender: text("sender"),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
  restoreBefore: timestamp("restore_before").notNull(),
  action: text("action").notNull(), // 'delete' | 'archive'
});

// Sender Rules (whitelist/blacklist)
export const senderRules = pgTable("sender_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderEmailPattern: text("sender_email_pattern").notNull(),
  ruleType: text("rule_type").notNull(), // 'whitelist' | 'blacklist'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const emailAccountsRelations = relations(emailAccounts, ({ many }) => ({
  groupMembers: many(accountGroupMembers),
  emails: many(emailCache),
  deletionQueue: many(deletionQueue),
}));

export const accountGroupsRelations = relations(accountGroups, ({ many }) => ({
  members: many(accountGroupMembers),
}));

export const accountGroupMembersRelations = relations(accountGroupMembers, ({ one }) => ({
  group: one(accountGroups, {
    fields: [accountGroupMembers.groupId],
    references: [accountGroups.id],
  }),
  account: one(emailAccounts, {
    fields: [accountGroupMembers.accountId],
    references: [emailAccounts.id],
  }),
}));

export const emailCacheRelations = relations(emailCache, ({ one }) => ({
  account: one(emailAccounts, {
    fields: [emailCache.accountId],
    references: [emailAccounts.id],
  }),
}));

export const deletionQueueRelations = relations(deletionQueue, ({ one }) => ({
  account: one(emailAccounts, {
    fields: [deletionQueue.accountId],
    references: [emailAccounts.id],
  }),
}));


// Type exports
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
export type AccountGroup = typeof accountGroups.$inferSelect;
export type EmailCacheEntry = typeof emailCache.$inferSelect;
export type CleanupRule = typeof cleanupRules.$inferSelect;
export type SenderRule = typeof senderRules.$inferSelect;