import { getServerSession } from "next-auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAccounts, emailCache } from "@/lib/db/schema";
import { desc, count } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, Inbox, Clock, AlertCircle } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();

  // Get account stats
  const accounts = await db.select().from(emailAccounts);
  const totalEmails = await db.select({ count: count() }).from(emailCache);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your email accounts
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
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

        <Card>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {accounts[0]?.lastSyncedAt
                ? new Date(accounts[0].lastSyncedAt).toLocaleDateString()
                : "Never"}
            </div>
            <p className="text-xs text-muted-foreground">
              Most recent account sync
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spam Flagged</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Emails marked as spam</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts List */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Manage your email accounts from the Accounts page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground">
              No accounts connected yet. Go to Accounts to add your email addresses.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{account.emailAddress}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.provider.toUpperCase()}
                      {account.displayName && ` - ${account.displayName}`}
                    </p>
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
              ))}
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