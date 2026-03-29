"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, RefreshCw, Archive, Mail, AlertTriangle } from "lucide-react";

interface EmailResult {
  id: string;
  accountId: string;
  accountEmail: string;
  providerEmailId: string;
  subject: string | null;
  sender: string | null;
  senderEmail: string | null;
  receivedAt: string | null;
  snippet: string | null;
}

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
}

interface CleanupRule {
  id: string;
  name: string;
  conditions: {
    senderPatterns?: string[];
    subjectKeywords?: string[];
  };
  action: string;
  isActive: boolean;
}

interface DeletionQueueItem {
  id: string;
  accountId: string;
  accountEmail: string;
  providerEmailId: string;
  subject: string | null;
  sender: string | null;
  deletedAt: string;
  restoreBefore: string;
}

export default function CleanupPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [results, setResults] = useState<EmailResult[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rules, setRules] = useState<CleanupRule[]>([]);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);

  useEffect(() => {
    fetchAccounts();
    fetchRules();
    fetchDeletionQueue();
  }, []);

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  };

  const selectAllAccounts = () => {
    setSelectedAccounts(accounts.map((a) => a.id));
  };

  const deselectAllAccounts = () => {
    setSelectedAccounts([]);
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch("/api/rules");
      const data = await res.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error("Error fetching rules:", error);
    }
  };

  const fetchDeletionQueue = async () => {
    try {
      const res = await fetch("/api/cleanup/queue");
      const data = await res.json();
      setDeletionQueue(data.queue || []);
    } catch (error) {
      console.error("Error fetching deletion queue:", error);
    }
  };

  const handleRestoreAll = async () => {
    if (deletionQueue.length === 0) {
      toast({
        title: "Nothing to restore",
        description: "No emails in the deletion queue",
      });
      return;
    }

    if (!confirm(`Restore all ${deletionQueue.length} deleted emails? This will move them back to your inbox.`)) {
      return;
    }

    try {
      const res = await fetch("/api/cleanup/restore-all", {
        method: "POST",
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Emails restored",
          description: `${data.restoredCount} emails restored to inbox`,
        });
        setDeletionQueue([]);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore emails",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (itemId: string) => {
    try {
      const res = await fetch("/api/cleanup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Email restored",
          description: "The email has been restored to your inbox.",
        });
        fetchDeletionQueue();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore email",
        variant: "destructive",
      });
    }
  };

  const handleSearch = async () => {
    if (selectedAccounts.length === 0) {
      toast({
        title: "No accounts selected",
        description: "Please select at least one account to search",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setSelectedEmails(new Set());

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        sender: senderFilter,
        accounts: selectedAccounts.join(","),
      });

      const res = await fetch(`/api/emails/search?${params}`);
      const data = await res.json();

      if (data.emails) {
        setResults(data.emails);
      } else {
        toast({
          title: "Error",
          description: data.error || "Search failed",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search emails",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedEmails.size === results.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(results.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedEmails);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedEmails(newSet);
  };

  const handleDelete = async () => {
    if (selectedEmails.size === 0) {
      toast({
        title: "No emails selected",
        description: "Please select emails to delete",
        variant: "destructive",
      });
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete ${selectedEmails.size} emails? They will be moved to trash and can be restored within 24 hours.`
      )
    ) {
      return;
    }

    setDeleting(true);

    try {
      const res = await fetch("/api/emails/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: Array.from(selectedEmails) }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Emails deleted",
          description: `${selectedEmails.size} emails have been moved to trash. Restore from the deletion queue within 24 hours.`,
        });
        setResults(results.filter((r) => !selectedEmails.has(r.id)));
        setSelectedEmails(new Set());
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete emails",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete emails",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cleanup</h1>
        <p className="text-muted-foreground">
          Search and bulk delete spam or unwanted emails
        </p>
      </div>

      {/* Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Accounts</CardTitle>
          <CardDescription>Choose which accounts to search</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={selectAllAccounts}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAllAccounts}>
              Deselect All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => toggleAccount(account.id)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  selectedAccounts.includes(account.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {account.displayName || account.emailAddress}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Find Emails</CardTitle>
          <CardDescription>
            Search for emails to delete or archive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="search">Subject or Content</Label>
              <Input
                id="search"
                placeholder="e.g., 'newsletter', 'unsubscribe'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender">Sender Email</Label>
              <Input
                id="sender"
                placeholder="e.g., 'spam@domain.com'"
                value={senderFilter}
                onChange={(e) => setSenderFilter(e.target.value)}
              />
            </div>
          </div>
          <Button className="mt-4" onClick={handleSearch} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Search
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Active Rules */}
      {rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Rules</CardTitle>
            <CardDescription>
              Emails matching these rules are automatically processed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {rule.conditions.senderPatterns?.join(", ") ||
                        rule.conditions.subjectKeywords?.join(", ")}
                      → {rule.action}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      rule.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {rule.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>
            Results ({results.length} emails found)
          </CardTitle>
          {selectedEmails.size > 0 && (
            <CardDescription>
              {selectedEmails.size} selected
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {loading ? "Searching..." : "Search for emails to clean up"}
            </p>
          ) : (
            <>
              {/* Actions */}
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {selectedEmails.size === results.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
                {selectedEmails.size > 0 && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Selected ({selectedEmails.size})
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>

              {/* Email List */}
              <div className="space-y-2">
                {results.map((email) => (
                  <div
                    key={email.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedEmails.has(email.id)
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => toggleSelect(email.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(email.id)}
                      onChange={() => toggleSelect(email.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {email.subject || "(No subject)"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {email.sender} {email.senderEmail && `<${email.senderEmail}>`}
                      </p>
                      {email.snippet && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {email.snippet}
                        </p>
                      )}
                    </div>
                    {email.receivedAt && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(email.receivedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Deletion Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Deletion Queue</CardTitle>
              <CardDescription>
                {deletionQueue.length} email(s) deleted in the last 24 hours. Restore before permanent deletion.
              </CardDescription>
            </div>
            {deletionQueue.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestoreAll}
              >
                Restore All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {deletionQueue.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No emails in the deletion queue
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {deletionQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {item.subject || "(No subject)"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.sender} • Deleted {new Date(item.deletedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-yellow-600">
                      Restore before {new Date(item.restoreBefore).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(item.id)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warning */}
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Important
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Deleted emails are stored in the deletion queue for 24 hours. After this time,
                they are permanently deleted and cannot be recovered.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}