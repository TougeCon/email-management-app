"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  reason: string;
}

type BulkAction = "unsubscribe" | "delete" | "unsubscribe-and-delete" | "archive";

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
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSender: "" });
  const [loading, setLoading] = useState(true);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "unsubscribe" | "delete">("all");
  const [selectedAction, setSelectedAction] = useState<BulkAction>("unsubscribe-and-delete");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchAccounts();
    fetchDeletionQueue();
  }, []);

  useEffect(() => {
    if (selectedAccounts.length > 0) {
      fetchSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts]);

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
      const params = new URLSearchParams();
      if (selectedAccounts.length > 0) {
        selectedAccounts.forEach((id) => params.append("accountId", id));
      }
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const res = await fetch(`/api/emails/suggestions?${params.toString()}`);
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
    if (!s.senderEmail) return false; // Skip null sender emails
    if (activeTab === "all") return true;
    if (activeTab === "unsubscribe") return s.actionType === "unsubscribe";
    if (activeTab === "delete") return s.actionType === "delete";
    return true;
  });

  const handleBulkAction = async (action: BulkAction) => {
    if (selected.size === 0) {
      toast({
        title: "No senders selected",
        description: "Select at least one sender to process",
        variant: "destructive",
      });
      return;
    }

    const unsubscribeSenders = suggestions
      .filter((s) => s.senderEmail && selected.has(s.senderEmail) && s.actionType === "unsubscribe")
      .length;

    const deleteSenders = suggestions
      .filter((s) => s.senderEmail && selected.has(s.senderEmail))
      .length;

    const selectedUnsubscribeCount = suggestions
      .filter((s) => s.senderEmail && selected.has(s.senderEmail) && s.actionType === "unsubscribe")
      .reduce((sum, s) => sum + s.count, 0);

    const selectedDeleteCount = suggestions
      .filter((s) => s.senderEmail && selected.has(s.senderEmail))
      .reduce((sum, s) => sum + s.count, 0);

    const actionLabels = {
      "unsubscribe": "Unsubscribe Only",
      "delete": "Delete Emails Only",
      "unsubscribe-and-delete": "Unsubscribe & Delete All",
      "archive": "Archive Emails",
    };

    let confirmMessage = `Selected Action: ${actionLabels[action]}\n\n`;
    confirmMessage += `Processing ${selected.size} sender(s):\n\n`;

    if (action === "unsubscribe-and-delete" || action === "unsubscribe") {
      confirmMessage += `• Unsubscribe from ${unsubscribeSenders} sender(s)\n`;
    }
    if (action === "unsubscribe-and-delete" || action === "delete") {
      confirmMessage += `• Delete ~${selectedDeleteCount.toLocaleString()} emails from ${deleteSenders} sender(s)\n`;
    }
    if (action === "archive") {
      confirmMessage += `• Archive ~${selectedDeleteCount.toLocaleString()} emails from ${deleteSenders} sender(s)\n`;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    setProcessing(true);
    setProgress({ current: 0, total: selected.size, currentSender: "" });
    const newlyProcessed = new Set<string>();

    const selectedArray = Array.from(selected);
    for (let i = 0; i < selectedArray.length; i++) {
      const senderEmail = selectedArray[i];
      const suggestion = suggestions.find((s) => s.senderEmail === senderEmail);
      if (!suggestion || !suggestion.senderEmail) continue;

      setProgress({ current: i + 1, total: selected.size, currentSender: suggestion.senderEmail || senderEmail });

      try {
        // Unsubscribe if action includes it and sender supports it
        if ((action === "unsubscribe" || action === "unsubscribe-and-delete") && suggestion.actionType === "unsubscribe") {
          const res = await fetch("/api/emails/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderEmail: suggestion.senderEmail }),
          });
          const data = await res.json();
          if (data.success) {
            newlyProcessed.add(senderEmail);
          }
        }

        // Delete emails if action includes it
        if (action === "delete" || action === "unsubscribe-and-delete") {
          const searchRes = await fetch(`/api/emails/search?sender=${encodeURIComponent(suggestion.senderEmail)}`);
          const searchData = await searchRes.json();

          if (searchData.emails && searchData.emails.length > 0) {
            const emailIds = searchData.emails.map((e: any) => e.id);
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

        // Archive emails
        if (action === "archive") {
          const searchRes = await fetch(`/api/emails/search?sender=${encodeURIComponent(suggestion.senderEmail)}`);
          const searchData = await searchRes.json();

          if (searchData.emails && searchData.emails.length > 0) {
            const emailIds = searchData.emails.map((e: any) => e.id);
            const archiveRes = await fetch("/api/emails/archive", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emailIds }),
            });
            const archiveData = await archiveRes.json();
            if (archiveData.success) {
              newlyProcessed.add(senderEmail);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process ${senderEmail}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setProgress({ current: 0, total: 0, currentSender: "" });

    setProcessed(newlyProcessed);
    setSuggestions(suggestions.filter((s) => s.senderEmail && !newlyProcessed.has(s.senderEmail)));
    setSelected(new Set());

    const actionLabelsComplete = {
      "unsubscribe-and-delete": "Unsubscribed & deleted",
      "unsubscribe": "Unsubscribed",
      "delete": "Deleted",
      "archive": "Archived",
    };

    toast({
      title: "Processing complete",
      description: `${actionLabelsComplete[action]} ${newlyProcessed.size} sender(s)`,
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

      {/* Date Range Filter */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Date Range Filter</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="text-xs">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="text-xs">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSuggestions}
                disabled={loading}
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Apply
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="w-full"
              >
                Clear
              </Button>
            </div>
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
                {filteredSuggestions.length} senders • ~{totalEmails.toLocaleString()} emails could be processed
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Unsubscribe</p>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                    {suggestions.filter(s => s.actionType === "unsubscribe").length} senders
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Delete</p>
                  <p className="text-lg font-bold text-red-900 dark:text-red-100">
                    {suggestions.filter(s => s.actionType === "delete").length} senders
                  </p>
                </div>
              </div>
            </div>
          </div>

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

          {/* Action Selection */}
          {filteredSuggestions.length > 0 && (
            <div className="space-y-3 mb-4">
              {/* Select All Controls */}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {selected.size === filteredSuggestions.length ? "Deselect All" : "Select All"}
                </Button>
                {activeTab !== "unsubscribe" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const unsubscribeEmails = suggestions
                        .filter(s => s.actionType === "unsubscribe")
                        .map(s => s.senderEmail!);
                      setSelected(new Set(unsubscribeEmails));
                    }}
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  >
                    Select Unsubscribe ({suggestions.filter(s => s.actionType === "unsubscribe").length})
                  </Button>
                )}
                {activeTab !== "delete" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const deleteEmails = suggestions
                        .filter(s => s.actionType === "delete")
                        .map(s => s.senderEmail!);
                      setSelected(new Set(deleteEmails));
                    }}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    Select Delete ({suggestions.filter(s => s.actionType === "delete").length})
                  </Button>
                )}
              </div>

              {/* Action Buttons */}
              {selected.size > 0 && (
                <div className="flex gap-2 flex-wrap p-3 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium self-center mr-2">
                    With {selected.size} sender(s):
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction("unsubscribe")}
                    disabled={processing || !suggestions.some(s => selected.has(s.senderEmail!) && s.actionType === "unsubscribe")}
                    className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Unsubscribe Only
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction("delete")}
                    disabled={processing}
                    className="bg-red-600 text-white hover:bg-red-700 border-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Emails Only
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleBulkAction("unsubscribe-and-delete")}
                    disabled={processing}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Unsubscribe & Delete All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction("archive")}
                    disabled={processing}
                    className="bg-green-600 text-white hover:bg-green-700 border-green-600"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive Emails
                  </Button>
                </div>
              )}

              {/* Progress Indicator */}
              {processing && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3 mb-2">
                    <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">
                      Processing senders...
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-blue-700 dark:text-blue-300 mb-2">
                    <span>Sender {progress.current} of {progress.total}</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  {progress.currentSender && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 truncate">
                      Current: {progress.currentSender}
                    </p>
                  )}
                </div>
              )}
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
                  key={suggestion.senderEmail!}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selected.has(suggestion.senderEmail!)
                      ? suggestion.actionType === "unsubscribe"
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200"
                        : "bg-red-50 dark:bg-red-900/20 border-red-200"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => toggleSelect(suggestion.senderEmail!)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(suggestion.senderEmail!)}
                    onChange={() => toggleSelect(suggestion.senderEmail!)}
                    className="h-4 w-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">
                        {suggestion.sender || suggestion.senderEmail}
                      </p>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {suggestion.reason}
                      </span>
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
                      {suggestion.senderEmail}
                    </p>
                    <p className="text-xs font-medium text-blue-600 mt-1">
                      {suggestion.count} email{suggestion.count !== 1 ? "s" : ""} from this sender
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
                  {processed.has(suggestion.senderEmail!) && (
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
