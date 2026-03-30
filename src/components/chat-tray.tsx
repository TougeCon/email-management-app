"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Send, RefreshCw, Trash2, X, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Account {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
}

interface ChatTrayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatTray({ isOpen, onClose }: ChatTrayProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      loadChatHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const loadChatHistory = async () => {
    try {
      const res = await fetch("/api/ai/chat");
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt),
        })));
      } else {
        setMessages([{
          role: "assistant",
          content: "Hello! I'm your AI email assistant. I can help you analyze your emails, suggest cleanup actions, identify patterns, and find specific messages. I can also take actions like deleting or marking emails as spam. What would you like to do?",
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      setMessages([{
        role: "assistant",
        content: "Hello! I'm your AI email assistant. How can I help you today?",
        timestamp: new Date(),
      }]);
    } finally {
      setLoadingHistory(false);
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

  const clearChatHistory = async () => {
    if (!confirm("Clear all chat history?")) return;
    try {
      await fetch("/api/ai/chat", { method: "DELETE" });
      setMessages([{
        role: "assistant",
        content: "Chat history cleared. How can I help you?",
        timestamp: new Date(),
      }]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear chat history",
        variant: "destructive",
      });
    }
  };

  const executeAction = async (action: string, criteria: string) => {
    const senderMatches = criteria.match(/from\s+([^\s,]+)/gi);
    const senderEmails = senderMatches?.map(m => m.replace(/from\s+/i, '').trim()) || [];
    const senderEmail = senderEmails[0] || null;

    const subjectMatch = criteria.match(/subject[:\s]+([^\s]+)/i);
    const subject = subjectMatch ? subjectMatch[1] : null;

    const containingMatch = criteria.match(/containing\s+(?:the\s+word\s+)?['"]?([^'"]+)['"]?/i);
    const keyword = containingMatch ? containingMatch[1] : null;

    try {
      const previewRes = await fetch("/api/ai/action/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          senderEmail,
          senderEmails: senderEmails.length > 1 ? senderEmails : undefined,
          subject,
          keyword,
          accountIds: selectedAccounts,
        }),
      });

      const previewData = await previewRes.json();

      if (previewData.count === 0) {
        return `No emails match that criteria.`;
      }

      if (previewData.count > 10) {
        const confirmed = confirm(
          `This will ${action.replace("_", " ")} ${previewData.count} emails. Are you sure you want to proceed?`
        );
        if (!confirmed) {
          return `Cancelled. No emails were ${action.replace("_", "ed")}.`;
        }
      }

      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          senderEmail,
          senderEmails: senderEmails.length > 1 ? senderEmails : undefined,
          subject,
          keyword,
          accountIds: selectedAccounts,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Action completed",
          description: `${action.replace("_", " ")} applied to ${data.processedCount} email(s)`,
        });
        return `Done! I've ${action.replace("_", " ")} ${data.processedCount} email(s).`;
      } else {
        console.error("Action failed:", data);
        return `Failed: ${data.error || "Unknown error"}`;
      }
    } catch (error) {
      console.error("Action execution failed:", error);
      return `Failed to execute action: ${error}`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          accountIds: selectedAccounts,
        }),
      });

      const data = await res.json();

      if (data.response) {
        let responseContent = data.response;

        const actionMatch = data.response.match(/ACTION:\s*(\w+)\s+(.+)/i);
        if (actionMatch) {
          const [, action, criteria] = actionMatch;
          const actionResult = await executeAction(action, criteria);
          responseContent = `${actionResult}\n\n${data.response.replace(/ACTION:.*$/m, "")}`;
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: responseContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get AI response",
        variant: "destructive",
      });
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    { label: "Top senders", query: "What senders email me most often?" },
    { label: "Spam patterns", query: "What patterns suggest spam in my emails?" },
    { label: "Delete spam", query: "Delete emails that look like spam" },
    { label: "Mark newsletters", query: "Mark newsletter emails as spam" },
  ];

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-[400px] bg-background border-l shadow-2xl transform transition-transform duration-300 ease-in-out z-50",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <h2 className="font-semibold">AI Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearChatHistory} disabled={loading}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Account Selection */}
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Accounts</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllAccounts} disabled={loading}>
                All
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={deselectAllAccounts} disabled={loading}>
                None
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => toggleAccount(account.id)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  selectedAccounts.includes(account.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                disabled={loading}
              >
                {account.displayName || account.emailAddress.split('@')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-3 border-t bg-muted/30">
          <div className="flex flex-wrap gap-1 mb-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setInput(action.query)}
                disabled={loading || loadingHistory}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your emails..."
              disabled={loading || loadingHistory}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading || loadingHistory || !input.trim()} size="sm">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
