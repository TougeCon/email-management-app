"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, RefreshCw, Undo } from "lucide-react";

interface Rule {
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

export default function RulesPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newRule, setNewRule] = useState({
    name: "",
    senderPattern: "",
    subjectKeyword: "",
    action: "mark_spam" as "delete" | "archive" | "mark_spam",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, queueRes] = await Promise.all([
        fetch("/api/rules"),
        fetch("/api/cleanup/queue"),
      ]);

      const rulesData = await rulesRes.json();
      const queueData = await queueRes.json();

      setRules(rulesData.rules || []);
      setDeletionQueue(queueData.queue || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name) {
      toast({
        title: "Error",
        description: "Rule name is required",
        variant: "destructive",
      });
      return;
    }

    if (!newRule.senderPattern && !newRule.subjectKeyword) {
      toast({
        title: "Error",
        description: "Please provide at least one condition (sender pattern or subject keyword)",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRule.name,
          conditions: {
            senderPatterns: newRule.senderPattern ? [newRule.senderPattern] : undefined,
            subjectKeywords: newRule.subjectKeyword ? [newRule.subjectKeyword] : undefined,
          },
          action: newRule.action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Rule created",
          description: "Your cleanup rule has been created.",
        });
        setNewRule({ name: "", senderPattern: "", subjectKeyword: "", action: "delete" });
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create rule",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    try {
      const res = await fetch(`/api/rules?id=${ruleId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "Rule deleted",
          description: "The cleanup rule has been removed.",
        });
        fetchData();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete rule",
        variant: "destructive",
      });
    }
  };

  const handleApplyRule = async (ruleId: string) => {
    if (!confirm("Apply this rule to all existing emails? This may take a while.")) {
      return;
    }

    try {
      const res = await fetch("/api/rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, applyToExisting: true }),
      });

      const data = await res.json();

      if (data.success) {
        const result = data.results?.[0];
        toast({
          title: "Rule applied",
          description: `${result?.processedCount || 0} emails processed`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply rule",
        variant: "destructive",
      });
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruleId, isActive }),
      });

      if (res.ok) {
        toast({
          title: isActive ? "Rule activated" : "Rule deactivated",
          description: `The rule has been ${isActive ? "activated" : "deactivated"}.`,
        });
        fetchData();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update rule",
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
        fetchData();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rules</h1>
        <p className="text-muted-foreground">
          Create rules to automatically clean up incoming emails
        </p>
      </div>

      {/* Create Rule */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Rule</CardTitle>
          <CardDescription>
            Automatically process emails matching your criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  placeholder="e.g., 'Newsletter Cleanup'"
                  value={newRule.name}
                  onChange={(e) =>
                    setNewRule({ ...newRule, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <select
                  id="action"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={newRule.action}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      action: e.target.value as "delete" | "archive" | "mark_spam",
                    })
                  }
                >
                  <option value="delete">Delete</option>
                  <option value="archive">Archive</option>
                  <option value="mark_spam">Mark as Spam</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Spam emails are hidden from inbox but kept for 30 days
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sender-pattern">Sender Pattern</Label>
                <Input
                  id="sender-pattern"
                  placeholder="e.g., '@spam-domain.com' or 'newsletter@'"
                  value={newRule.senderPattern}
                  onChange={(e) =>
                    setNewRule({ ...newRule, senderPattern: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Match emails from specific senders
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-keyword">Subject Keyword</Label>
                <Input
                  id="subject-keyword"
                  placeholder="e.g., 'Weekly Newsletter' or 'Promo'"
                  value={newRule.subjectKeyword}
                  onChange={(e) =>
                    setNewRule({ ...newRule, subjectKeyword: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Match emails with specific subject keywords
                </p>
              </div>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Rule
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Active Rules</CardTitle>
          <CardDescription>
            Rules are processed when emails are fetched from your accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading rules...</p>
          ) : rules.length === 0 ? (
            <p className="text-muted-foreground">
              No rules created yet. Create a rule above to automatically clean up
              emails.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {rule.conditions.senderPatterns?.join(", ")}
                      {rule.conditions.senderPatterns && rule.conditions.subjectKeywords && " • "}
                      {rule.conditions.subjectKeywords?.join(", ")}
                      {" → "}
                      <span className="capitalize">{rule.action}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleRule(rule.id, !rule.isActive)}
                    >
                      {rule.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyRule(rule.id)}
                    >
                      Apply Now
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRule(rule.id)}
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

      {/* Deletion Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Deletion Queue</CardTitle>
          <CardDescription>
            Emails deleted in the last 24 hours. Restore before they&apos;re permanently
            deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading...</p>
          ) : deletionQueue.length === 0 ? (
            <p className="text-muted-foreground">
              No emails in the deletion queue.
            </p>
          ) : (
            <div className="space-y-3">
              {deletionQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{item.subject || "(No subject)"}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.sender} • Deleted {new Date(item.deletedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-yellow-600">
                      Restore before {new Date(item.restoreBefore).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleRestore(item.id)}>
                    <Undo className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}