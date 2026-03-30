"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  Mail, RefreshCw, ExternalLink, CheckCircle, Trash2,
  UserX, Archive, AlertTriangle, Tag, Calendar
} from "lucide-react";

interface Suggestion {
  sender: string | null;
  senderEmail: string | null;
  count: number;
  sampleSubject: string | null;
  lastReceived: Date | null;
  actionType: "unsubscribe" | "delete";
  hasUnsubscribeLink: boolean;
}

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
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

export default function ManagePage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "unsubscribe" | "delete">("all");

  useEffect(() => {
    fetchAccounts();
    fetchSuggestions();
    fetchDeletionQueue();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setSelectedAccounts((data.accounts || []).map((a: Account) => a.id));
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails/suggestions");
      const data = await res.json();

      if (data.suggestions) {
        setSuggestions(data.suggestions);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch suggestions",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load suggestions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

  const toggleSelect = (senderEmail: string) => {
    const newSet = new Set(selected);
    if (newSet.has(senderEmail)) {
      newSet.delete(senderEmail);
    } else {
      newSet.add(senderEmail);
    }
    setSelected(newSet);
  };

  const toggleSelectAll = () => {
    const filtered = filteredSuggestions.filter((s) => s.senderEmail !== null);
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.senderEmail!)));
    }
  };

  const filteredSuggestions = suggestions.filter((s) => {
    if (activeTab === "all") return true;
    if (activeTab === "unsubscribe") return s.actionType === "unsubscribe";
    if (activeTab === "delete") return s.actionType === "delete";
    return true;
  });

  const handleAction = async () => {
    if (selected.size === 0) {
      toast({
        title: "No senders selected",
        description: "Select at least one sender to process",
        variant: "destructive",
      });
      return;
    }

    const unsubscribeSenders = suggestions
      .filter((s) => selected.has(s.senderEmail) && s.actionType === "unsubscribe")
      .length;

    const deleteSenders = suggestions
      .filter((s) => selected.has(s.senderEmail) && s.actionType === "delete")
      .length;

    const totalEmails = suggestions
      .filter((s) => selected.has(s.senderEmail))
      .reduce((sum, s) => sum + s.count, 0);

    if (!confirm(`This will process ${selected.size} sender(s) affecting approximately ${totalEmails} emails.

${unsubscribeSenders > 0 ? `• Unsubscribe from ${unsubscribeSenders} sender(s)` : ""}
${deleteSenders > 0 ? `• Delete emails from ${deleteSenders} sender(s)` : ""}

Continue?`)) {
      return;
    }

    setProcessing(true);
    const newlyProcessed = new Set<string>();

    for (const senderEmail of selected) {
      const suggestion = suggestions.find((s) => s.senderEmail === senderEmail);
      if (!suggestion) continue;

      try {
        if (suggestion.actionType === "unsubscribe") {
          const res = await fetch("/api/emails/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderEmail }),
          });

          const data = await res.json();
          if (data.success) {
            newlyProcessed.add(senderEmail);
          }
        } else if (suggestion.actionType === "delete") {
          // Search for emails from this sender and delete them
          const searchRes = await fetch(`/api/emails/search?sender=${encodeURIComponent(senderEmail)}`);
          const searchData = await searchRes.json();

          if (searchData.emails && searchData.emails.length > 0) {
            const emailIds = searchData.emails.map((e: any) => e.id);

            // Show confirmation for large deletions
            if (emailIds.length > 10) {
              if (!confirm(`Delete ${emailIds.length} emails from ${senderEmail}?`)) {
                continue;
              }
            }

            const deleteRes = await fetch("/api/emails/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emailIds }),
            });

            const deleteData = await deleteRes.json();
            if (deleteData.success) {
              newlyProcessed.add(senderEmail);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process ${senderEmail}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setProcessed(newlyProcessed);
    setSuggestions(suggestions.filter((s) => !newlyProcessed.has(s.senderEmail)));
    setSelected(new Set(selected));

    toast({
      title: "Processing complete",
      description: `Processed ${newlyProcessed.size} sender(s)`,
    });

    setProcessing(false);
    fetchDeletionQueue();
  };

  const handleRestoreAll = async () => {
    if (deletionQueue.length === 0) {
      toast({
        title: "Nothing to restore",
        description: "No emails in the deletion queue",
      });
      return;
    }

    if (!confirm(`Restore all ${deletionQueue.length} deleted emails?`)) {
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

  const totalEmails = filteredSuggestions.reduce((sum, s) => sum + s.count, 0);
  const unsubscribeCount = filteredSuggestions.filter(s => s.actionType === "unsubscribe").length;
  const deleteCount = filteredSuggestions.filter(s => s.actionType === "delete").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Email Management</h1>
        <p className="text-muted-foreground">
          Unsubscribe from newsletters and delete unwanted emails
        </p>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">
                How it works
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                We analyze your emails to find newsletters (with unsubscribe options) and spam patterns.
                Select senders to process - unsubscribe from newsletters or delete spam emails.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Selection */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Select Accounts</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllAccounts}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAllAccounts}>
                Deselect All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-2">
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => toggleAccount(account.id)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
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

      {/* Suggestions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Suggested Actions</CardTitle>
              <CardDescription>
                {filteredSuggestions.length} senders • ~{totalEmails} emails
                {unsubscribeCount > 0 && <span className="ml-2 text-blue-600">• {unsubscribeCount} unsubscribe</span>}
                {deleteCount > 0 && <span className="ml-2 text-red-600">• {deleteCount} delete</span>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b pb-2">
            <Button
              variant={activeTab === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("all")}
            >
              All ({suggestions.length})
            </Button>
            <Button
              variant={activeTab === "unsubscribe" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("unsubscribe")}
            >
              <UserX className="h-4 w-4 mr-1" />
              Unsubscribe ({suggestions.filter(s => s.actionType === "unsubscribe").length})
            </Button>
            <Button
              variant={activeTab === "delete" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("delete")}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete ({suggestions.filter(s => s.actionType === "delete").length})
            </Button>
          </div>

          {/* Actions Bar */}
          {filteredSuggestions.length > 0 && (
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                {selected.size === filteredSuggestions.length ? "Deselect All" : "Select All"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleAction}
                disabled={selected.size === 0 || processing}
                className={selected.size > 0 ? "bg-orange-600 hover:bg-orange-700" : ""}
              >
                {processing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Process {selected.size} Sender(s)
                  </>
                )}
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Analyzing emails...</span>
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full w-fit mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">No suggestions found</h3>
              <p className="text-muted-foreground">
                Your emails look clean! No newsletters or spam detected.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <div
                  key={suggestion.senderEmail}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selected.has(suggestion.senderEmail)
                      ? suggestion.actionType === "unsubscribe"
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200"
                        : "bg-red-50 dark:bg-red-900/20 border-red-200"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => toggleSelect(suggestion.senderEmail)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(suggestion.senderEmail)}
                    onChange={() => toggleSelect(suggestion.senderEmail)}
                    className="h-4 w-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {suggestion.sender || suggestion.senderEmail}
                      </p>
                      {suggestion.actionType === "unsubscribe" ? (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <UserX className="h-3 w-3" />
                          Unsubscribe
                        </span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {suggestion.senderEmail} • {suggestion.count} email{suggestion.count !== 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      {suggestion.sampleSubject && (
                        <p className="text-xs text-muted-foreground truncate">
                          Sample: {suggestion.sampleSubject}
                        </p>
                      )}
                      {suggestion.lastReceived && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(suggestion.lastReceived).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  {processed.has(suggestion.senderEmail) && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deletion Queue */}
      {deletionQueue.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Deletion Queue</CardTitle>
                <CardDescription>
                  {deletionQueue.length} email(s) deleted in the last 24 hours
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleRestoreAll}>
                Restore All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
                  <Button variant="outline" size="sm" onClick={() => handleRestore(item.id)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                Deleted emails can be restored from the deletion queue within 24 hours.
                Unsubscribe actions may require clicking confirmation links in your email.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
