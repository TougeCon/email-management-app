"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Send, RefreshCw, Trash2 } from "lucide-react";

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

export default function AIChatPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAccounts();
    loadChatHistory();
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const executeAction = async (action: string, criteria: string) => {
    const senderMatch = criteria.match(/from\s+([^\s]+)/i);
    const senderEmail = senderMatch ? senderMatch[1] : null;
    const subjectMatch = criteria.match(/subject[:\s]+([^\s]+)/i);
    const subject = subjectMatch ? subjectMatch[1] : null;

    try {
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          senderEmail,
          subject,
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

        // Check for ACTION: command
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
    <div className="h-[calc(100vh-80px)] flex flex-col">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Chat</h1>
            <p className="text-muted-foreground">
              Ask questions about your emails and take actions
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearChatHistory} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear History
          </Button>
        </div>
      </div>

      {/* Account Selection */}
      <Card className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Select Accounts</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllAccounts} disabled={loading}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAllAccounts} disabled={loading}>
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
                disabled={loading}
              >
                {account.displayName || account.emailAddress}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card className="flex-1 overflow-hidden flex flex-col mb-4">
        <CardContent className="flex-1 overflow-y-auto p-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading history...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-gray-100 dark:bg-gray-800"
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
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-2">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            onClick={() => setInput(action.query)}
            disabled={loading || loadingHistory}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your emails or say 'delete emails from spam@example.com'..."
          disabled={loading || loadingHistory}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={loading || loadingHistory || !input.trim()}>
          <Send className="h-4 w-4 mr-2" />
          Send
        </Button>
      </div>
    </div>
  );
}
