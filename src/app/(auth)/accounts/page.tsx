"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Trash2, RefreshCw, Plus, Shield, Inbox, Database } from "lucide-react";
import { SyncButton } from "@/components/sync-button";

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  emailCount?: number;
}

const PROVIDER_NAMES: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  aol: "AOL",
};

export default function AccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [aolEmail, setAolEmail] = useState("");
  const [aolPassword, setAolPassword] = useState("");
  const [aolDisplayName, setAolDisplayName] = useState("");
  const [addingAol, setAddingAol] = useState(false);

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for OAuth callback messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected) {
      toast({
        title: "Account connected",
        description: `Your ${PROVIDER_NAMES[connected] || connected} account has been connected successfully.`,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (error) {
      toast({
        title: "Error",
        description: `Failed to connect account: ${error}`,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const accounts = data.accounts || [];

      // Fetch email counts for each account
      const accountsWithCounts = await Promise.all(
        accounts.map(async (account: Account) => {
          try {
            const countRes = await fetch(`/api/emails/count?accountId=${account.id}`);
            const countData = await countRes.json();
            return { ...account, emailCount: countData.count || 0 };
          } catch {
            return { ...account, emailCount: 0 };
          }
        })
      );

      setAccounts(accountsWithCounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast({
        title: "Error",
        description: "Failed to load accounts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = () => {
    // Redirect to Gmail OAuth
    const redirectUri = `${window.location.origin}/api/accounts/callback/gmail`;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify&` +
      `access_type=offline&` +
      `prompt=consent`;
    window.location.href = authUrl;
  };

  const handleConnectOutlook = () => {
    // Redirect to Outlook OAuth
    const redirectUri = `${window.location.origin}/api/accounts/callback/outlook`;
    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite&` +
      `response_mode=query`;
    window.location.href = authUrl;
  };

  const handleAddAol = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingAol(true);

    try {
      const res = await fetch("/api/accounts/aol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: aolEmail,
          password: aolPassword,
          displayName: aolDisplayName || null,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Account connected",
          description: "Your AOL account has been connected successfully.",
        });
        setAolEmail("");
        setAolPassword("");
        setAolDisplayName("");
        fetchAccounts();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to connect AOL account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect AOL account",
        variant: "destructive",
      });
    } finally {
      setAddingAol(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to remove this account?")) {
      return;
    }

    try {
      const res = await fetch(`/api/accounts?id=${accountId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "Account removed",
          description: "The account has been disconnected.",
        });
        fetchAccounts();
      } else {
        toast({
          title: "Error",
          description: "Failed to remove account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove account",
        variant: "destructive",
      });
    }
  };

  const handleBulkSync = async (accountId: string, accountEmail: string) => {
    if (!confirm(`This will sync ALL emails from all folders for ${accountEmail}. This may take several minutes. Continue?`)) {
      return;
    }

    setSyncingAccount(accountId);
    let totalSynced = 0;
    let chunkCount = 0;
    const maxChunks = 200; // Safety limit to prevent infinite loops

    try {
      // Use chunked sync for large mailboxes - each chunk syncs 500 emails
      // This avoids request timeouts by making multiple shorter requests
      let lastMessageId: string | null = null;

      while (chunkCount < maxChunks) {
        chunkCount++;

        const syncResult = await fetch("/api/sync/chunked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            chunkSize: 500,
            lastMessageId,
          }),
        });

        const syncData: { success: boolean; syncedCount: number; hasMore: boolean; lastMessageId: string | null; error?: string } = await syncResult.json();

        if (syncData.success) {
          totalSynced += syncData.syncedCount;
          lastMessageId = syncData.lastMessageId;

          // Log progress for debugging
          console.log(`[Sync] Chunk ${chunkCount}: synced ${syncData.syncedCount}, total: ${totalSynced}, hasMore: ${syncData.hasMore}`);

          if (!syncData.hasMore) {
            console.log(`[Sync] No more emails to sync`);
            break;
          }

          // Update UI with progress every chunk for large mailboxes
          if (chunkCount % 2 === 0 || totalSynced < 1000) {
            toast({
              title: "Syncing...",
              description: `Chunk ${chunkCount}: Synced ${totalSynced.toLocaleString()} emails so far...`,
            });
          }
        } else {
          console.error(`[Sync] Chunk ${chunkCount} failed:`, syncData.error);
          throw new Error(syncData.error || "Sync failed");
        }

        // Small delay between chunks to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (chunkCount >= maxChunks) {
        toast({
          title: "Sync paused",
          description: `Synced ${totalSynced.toLocaleString()} emails. Click "Bulk Sync ALL" again to continue.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Bulk sync complete",
          description: `Synced ${totalSynced.toLocaleString()} emails from all folders.`,
        });
      }
      fetchAccounts();
    } catch (error) {
      toast({
        title: "Error",
        description: "Bulk sync failed",
        variant: "destructive",
      });
    } finally {
      setSyncingAccount(null);
    }
  };

  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Accounts</h1>
        <p className="text-muted-foreground">
          Manage your connected email accounts
        </p>
      </div>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                Your currently connected email accounts
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading accounts...</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full w-fit mx-auto mb-4">
                <Mail className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No accounts connected</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Connect your first email account to start managing your emails in one place.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-lg border p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        account.provider === 'gmail' ? 'bg-red-100 text-red-600' :
                        account.provider === 'outlook' ? 'bg-blue-100 text-blue-600' :
                        'bg-orange-100 text-orange-600'
                      }`}>
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{account.emailAddress}</p>
                        <p className="text-sm text-muted-foreground">
                          {PROVIDER_NAMES[account.provider] || account.provider}
                          {account.displayName && ` • ${account.displayName}`}
                          {account.emailCount !== undefined && ` • ${account.emailCount.toLocaleString()} emails`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          account.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAccount(account.id)}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Sync section for this account */}
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {account.lastSyncedAt ? (
                          <span>Last synced: {new Date(account.lastSyncedAt).toLocaleString()}</span>
                        ) : (
                          <span>Not yet synced</span>
                        )}
                      </div>
                      <SyncButton
                        accountId={account.id}
                        accountEmail={account.emailAddress}
                        variant="outline"
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Bulk sync all folders (INBOX, Spam, Sent, etc.)
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkSync(account.id, account.emailAddress)}
                        disabled={syncingAccount === account.id}
                        className="gap-2"
                      >
                        {syncingAccount === account.id ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Database className="h-4 w-4" />
                            Bulk Sync ALL
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Accounts */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Add New Account</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Gmail */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="p-3 bg-red-100 dark:bg-red-900 rounded-full w-fit mb-2">
                <Mail className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-lg">Gmail</CardTitle>
              <CardDescription>
                Gmail or Google Workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleConnectGmail} className="w-full bg-red-600 hover:bg-red-700">
                <Plus className="mr-2 h-4 w-4" />
                Connect
              </Button>
            </CardContent>
          </Card>

          {/* Outlook */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full w-fit mb-2">
                <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-lg">Outlook</CardTitle>
              <CardDescription>
                Outlook.com or Hotmail
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleConnectOutlook} className="w-full bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Connect
              </Button>
            </CardContent>
          </Card>

          {/* AOL */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-full w-fit mb-2">
                <Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle className="text-lg">AOL / AIM</CardTitle>
              <CardDescription>
                Using app password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddAol} className="space-y-3">
                <div className="space-y-2">
                  <Input
                    type="email"
                    value={aolEmail}
                    onChange={(e) => setAolEmail(e.target.value)}
                    placeholder="you@aol.com"
                    required
                    className="text-sm"
                  />
                  <Input
                    type="password"
                    value={aolPassword}
                    onChange={(e) => setAolPassword(e.target.value)}
                    placeholder="App password"
                    required
                    className="text-sm"
                  />
                </div>
                <Button type="submit" disabled={addingAol} className="w-full bg-orange-600 hover:bg-orange-700">
                  {addingAol ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Connect
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">
                Secure Connection
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your email credentials are encrypted and stored securely. OAuth connections use official provider APIs with read-only access by default.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}