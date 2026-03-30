import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { desc, count, eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Inbox, Clock, AlertCircle, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  // Get account stats
  const accounts = await db.select().from(emailAccounts);
  const totalEmails = await db.select({ count: count() }).from(emailCache);

  // Get email count per account
  const accountEmailCounts = await Promise.all(
    accounts.map(async (account) => {
      const result = await db
        .select({ count: count() })
        .from(emailCache)
        .where(eq(emailCache.accountId, account.id));
      return { accountId: account.id, email: account.emailAddress, count: result[0]?.count || 0 };
    })
  );

  // Get recent emails
  const recentEmails = await db
    .select()
    .from(emailCache)
    .orderBy(desc(emailCache.receivedAt))
    .limit(5);

  // Get top senders
  const topSenders = await db
    .select({
      senderEmail: emailCache.senderEmail,
      sender: emailCache.sender,
      count: count(),
    })
    .from(emailCache)
    .groupBy(emailCache.senderEmail, emailCache.sender)
    .orderBy(desc(count()))
    .limit(5);

  const lastSyncTime = accounts[0]?.lastSyncedAt
    ? new Date(accounts[0].lastSyncedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your email accounts
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Connected Accounts
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">
              {accounts.filter((a) => a.isActive).length} active
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Emails Cached
            </CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmails[0]?.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Across all accounts
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate" title={lastSyncTime}>
              {accounts[0]?.lastSyncedAt
                ? new Date(accounts[0].lastSyncedAt).toLocaleString()
                : "Never"}
            </div>
            <p className="text-xs text-muted-foreground">
              Most recent account sync
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalEmails[0]?.count || 0) * 0.001} MB</div>
            <p className="text-xs text-muted-foreground">Cached email metadata</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                Your currently connected email accounts
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No accounts connected yet.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Accounts to add your email addresses.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const accountCount = accountEmailCounts.find((c) => c.accountId === account.id);
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        account.provider === 'gmail' ? 'bg-red-100 text-red-600' :
                        account.provider === 'outlook' ? 'bg-blue-100 text-blue-600' :
                        'bg-orange-100 text-orange-600'
                      }`}>
                        <Mail className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{account.emailAddress}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.provider.toUpperCase()}
                          {account.displayName && ` • ${account.displayName}`}
                          {accountCount && ` • ${accountCount.count.toLocaleString()} emails`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          account.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Senders */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Senders</CardTitle>
            <CardDescription>Most frequent email senders</CardDescription>
          </CardHeader>
          <CardContent>
            {topSenders.length === 0 ? (
              <p className="text-muted-foreground">No emails cached yet</p>
            ) : (
              <div className="space-y-2">
                {topSenders.map((sender, i) => (
                  <div
                    key={sender.senderEmail || i}
                    className="flex items-center justify-between"
                  >
                    <div className="truncate">
                      <p className="text-sm font-medium">{sender.sender}</p>
                      <p className="text-xs text-muted-foreground">
                        {sender.senderEmail}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {sender.count} emails
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Emails</CardTitle>
            <CardDescription>Latest emails across accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEmails.length === 0 ? (
              <p className="text-muted-foreground">No emails cached yet</p>
            ) : (
              <div className="space-y-2">
                {recentEmails.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between"
                  >
                    <div className="truncate">
                      <p className="text-sm font-medium truncate">
                        {email.subject || "(No subject)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {email.sender}
                      </p>
                    </div>
                    {email.receivedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(email.receivedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}