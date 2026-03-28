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
import { Mail, Trash2, RefreshCw } from "lucide-react";

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
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
      setAccounts(data.accounts || []);
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
    const { getGmailAuthUrl } = require("@/lib/email-providers/gmail");
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
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Your currently connected email accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-muted-foreground">
              No accounts connected yet. Use the options below to connect your email accounts.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{account.emailAddress}</p>
                      <p className="text-sm text-muted-foreground">
                        {PROVIDER_NAMES[account.provider] || account.provider}
                        {account.displayName && ` - ${account.displayName}`}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Accounts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gmail */}
        <Card>
          <CardHeader>
            <CardTitle>Connect Gmail</CardTitle>
            <CardDescription>
              Connect your Gmail or Google Workspace account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnectGmail} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              Connect Gmail
            </Button>
          </CardContent>
        </Card>

        {/* Outlook */}
        <Card>
          <CardHeader>
            <CardTitle>Connect Outlook</CardTitle>
            <CardDescription>
              Connect your Outlook.com or Hotmail account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnectOutlook} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              Connect Outlook
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* AOL */}
      <Card>
        <CardHeader>
          <CardTitle>Connect AOL</CardTitle>
          <CardDescription>
            Connect your AOL account using an app password. You can generate one in
            your AOL account security settings after enabling 2FA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddAol} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="aol-email">Email Address</Label>
                <Input
                  id="aol-email"
                  type="email"
                  value={aolEmail}
                  onChange={(e) => setAolEmail(e.target.value)}
                  placeholder="you@aol.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aol-password">App Password</Label>
                <Input
                  id="aol-password"
                  type="password"
                  value={aolPassword}
                  onChange={(e) => setAolPassword(e.target.value)}
                  placeholder="App password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aol-display">Display Name (optional)</Label>
                <Input
                  id="aol-display"
                  value={aolDisplayName}
                  onChange={(e) => setAolDisplayName(e.target.value)}
                  placeholder="Personal AOL"
                />
              </div>
            </div>
            <Button type="submit" disabled={addingAol}>
              {addingAol ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Connect AOL
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}