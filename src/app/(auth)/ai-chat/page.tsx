"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Send, RefreshCw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIChatPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I'm your AI email assistant. I can help you search through your emails, suggest cleanup actions, analyze patterns, and recommend rules for managing incoming emails. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        }),
      });

      const data = await res.json();

      if (data.response) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get AI response. Make sure Ollama is running.",
        variant: "destructive",
      });
      // Add error message
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I couldn't process your request. Please make sure Ollama is running and try again.",
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

  const exampleQueries = [
    "How many emails do I have from newsletters?",
    "Find emails from PayPal",
    "What senders email me most often?",
    "Suggest emails I might want to delete",
    "Show me unread emails from this week",
    "Which emails should I archive?",
  ];

  const quickActions = [
    { label: "Find spam", query: "Find emails that look like spam" },
    { label: "Newsletters", query: "Find all newsletter emails" },
    { label: "Unread", query: "Show me important unread emails" },
    { label: "Old emails", query: "Find emails older than 30 days" },
  ];

  return (
    <div className="space-y-6 h-[calc(100vh-200px)] flex flex-col">
      <div>
        <h1 className="text-3xl font-bold">AI Chat</h1>
        <p className="text-muted-foreground">
          Ask questions about your emails in natural language
        </p>
      </div>

      {/* Messages */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4">
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
        </CardContent>
      </Card>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your emails..."
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()}>
          <Send className="h-4 w-4 mr-2" />
          Send
        </Button>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Quick actions:</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              size="sm"
              onClick={() => setInput(action.query)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Example Queries */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Try asking:</p>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.map((query) => (
            <Button
              key={query}
              variant="outline"
              size="sm"
              onClick={() => setInput(query)}
            >
              {query}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}