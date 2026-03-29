"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Mail, RefreshCw, ExternalLink, CheckCircle, XCircle } from "lucide-react";

interface UnsubscribeCandidate {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string | null;
  count: number;
  hasListUnsubscribe: boolean;
  hasUnsubscribeLink: boolean;
  sampleSubject: string | null;
}

export default function UnsubscribePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<UnsubscribeCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails/unsubscribe-candidates");
      const data = await res.json();

      if (data.candidates) {
        setCandidates(data.candidates);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch candidates",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load unsubscribe candidates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.senderEmail)));
    }
  };

  const handleUnsubscribe = async () => {
    if (selected.size === 0) {
      toast({
        title: "No senders selected",
        description: "Select at least one sender to unsubscribe from",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`Unsubscribe from ${selected.size} sender(s)? This will open unsubscribe links in new tabs. You may need to complete some unsubscribes manually.`)) {
      return;
    }

    setProcessing(true);
    const newlyProcessed = new Set<string>();

    for (const senderEmail of selected) {
      try {
        const res = await fetch("/api/emails/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderEmail }),
        });

        const data = await res.json();

        if (data.success) {
          newlyProcessed.add(senderEmail);
        }
      } catch (error) {
        console.error(`Failed to unsubscribe from ${senderEmail}:`, error);
      }

      // Small delay between each to avoid overwhelming
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setProcessed(newlyProcessed);
    setCandidates(candidates.filter((c) => !newlyProcessed.has(c.senderEmail)));
    setSelected(new Set(selected));

    toast({
      title: "Unsubscribe complete",
      description: `Processed ${newlyProcessed.size} sender(s). Check your email for confirmation links.`,
    });

    setProcessing(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Unsubscribe</h1>
        <p className="text-muted-foreground">
          Find and unsubscribe from newsletters and marketing emails
        </p>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">
                How it works
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                We scan your cached emails for common unsubscribe patterns like unsubscribe, opt-out,
                and List-Unsubscribe headers. Select the senders you want to unsubscribe from, and we will
                help you process them. Some may require clicking a confirmation link.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Unsubscribe Candidates</CardTitle>
              <CardDescription>
                {candidates.length} senders found with unsubscribe options
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCandidates} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Scanning emails...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full w-fit mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">No unsubscribe candidates found</h3>
              <p className="text-muted-foreground">
                Your emails look clean! No newsletters or marketing emails detected.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {selected.size === candidates.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleUnsubscribe}
                  disabled={selected.size === 0 || processing}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {processing ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Unsubscribe from {selected.size} sender(s)
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.senderEmail}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selected.has(candidate.senderEmail)
                        ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => toggleSelect(candidate.senderEmail)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(candidate.senderEmail)}
                      onChange={() => toggleSelect(candidate.senderEmail)}
                      className="h-4 w-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{candidate.sender || candidate.senderEmail}</p>
                        {candidate.hasListUnsubscribe && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            List-Unsubscribe
                          </span>
                        )}
                        {candidate.hasUnsubscribeLink && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            Unsubscribe Link
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {candidate.senderEmail} • {candidate.count} email{candidate.count !== 1 ? "s" : ""}
                      </p>
                      {candidate.sampleSubject && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Sample: {candidate.sampleSubject}
                        </p>
                      )}
                    </div>
                    {processed.has(candidate.senderEmail) && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
