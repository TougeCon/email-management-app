"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Search, Mail, RefreshCw, Sparkles } from "lucide-react";

interface EmailResult {
  id: string;
  accountId: string;
  subject: string | null;
  sender: string | null;
  senderEmail: string | null;
  receivedAt: string | null;
  isRead: boolean;
  snippet: string | null;
}

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
  isActive: boolean;
}

export default function SearchPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [results, setResults] = useState<EmailResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
      // Select all accounts by default
      setSelectedAccounts((data.accounts || []).map((a: Account) => a.id));
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ai/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();

      if (data.parsed) {
        if (data.parsed.sender) setSenderFilter(data.parsed.sender);
        if (data.parsed.query) setSearchQuery(data.parsed.query);
        toast({
          title: "AI Search Parsed",
          description: `Search refined: ${data.parsed.query || "all emails"} ${data.parsed.sender ? `from ${data.parsed.sender}` : ""}`,
        });
      }
    } catch (error) {
      console.error("AI parse error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (pageNum = 0) => {
    if (selectedAccounts.length === 0) {
      toast({
        title: "No accounts selected",
        description: "Please select at least one account to search",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        sender: senderFilter,
        accounts: selectedAccounts.join(","),
        page: pageNum.toString(),
        pageSize: pageSize.toString(),
      });

      const res = await fetch(`/api/emails/search?${params}`);
      const data = await res.json();

      if (data.emails) {
        setResults(data.emails);
        setTotalResults(data.total);
        setPage(pageNum);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Search Emails</h1>
        <p className="text-muted-foreground">
          Search across all your connected email accounts
        </p>
      </div>

      {/* Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Accounts</CardTitle>
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
          <div className="flex items-center justify-between">
            <CardTitle>Search Filters</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiSearch}
              disabled={!searchQuery.trim() || loading}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              AI Parse
            </Button>
          </div>
          <CardDescription>
            Use natural language and click AI Parse to extract search terms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                placeholder="e.g., newsletter from last week..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender-filter">Sender Email</Label>
              <Input
                id="sender-filter"
                placeholder="e.g., sender@example.com"
                value={senderFilter}
                onChange={(e) => setSenderFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => handleSearch(0)} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSenderFilter("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>
            Results ({totalResults} {totalResults === 1 ? "email" : "emails"})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {loading ? "Searching..." : "Enter search criteria and click Search"}
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((email) => (
                <div
                  key={email.id}
                  className="rounded-lg border p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">
                        {email.subject || "(No subject)"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {email.sender} {email.senderEmail && `<${email.senderEmail}>`}
                      </p>
                      {email.snippet && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {email.snippet}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {email.receivedAt && (
                        <p className="text-sm text-muted-foreground">
                          {new Date(email.receivedAt).toLocaleDateString()}
                        </p>
                      )}
                      {!email.isRead && (
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Unread
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalResults > pageSize && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => handleSearch(page - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {page + 1} of {Math.ceil(totalResults / pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * pageSize >= totalResults}
                onClick={() => handleSearch(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}