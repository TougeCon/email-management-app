"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface SyncButtonProps {
  accountId?: string;
  accountEmail?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showProgress?: boolean;
}

export function SyncButton({ accountId, accountEmail, variant = "outline", size = "sm", showProgress = true }: SyncButtonProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setProgress({ current: 0, total: 1000 }); // Estimate

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, maxEmails: 1000 }),
      });

      const data = await res.json();

      if (data.success) {
        const total = data.totalEmailsSynced || 0;
        setProgress({ current: total, total });
        setLastSynced(new Date());
        toast({
          title: "Sync complete",
          description: `Synced ${total} email${total !== 1 ? "s" : ""} from ${accountEmail || "account"}`,
        });
        // Auto-refresh page after 2 seconds to show new emails
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(data.error || "Sync failed");
        toast({
          title: "Sync failed",
          description: data.error || "Failed to sync emails",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      setError(errMsg);
      toast({
        title: "Sync error",
        description: errMsg,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        size={size}
        onClick={handleSync}
        disabled={syncing}
        className="gap-2 w-full"
      >
        {syncing ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : error ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : lastSynced ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {syncing ? "Syncing..." : lastSynced ? "Synced" : error ? "Failed" : "Sync Emails"}
      </Button>

      {showProgress && (syncing || progress || lastSynced || error) && (
        <div className="text-xs text-muted-foreground">
          {syncing && (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (progress?.current || 0) / 10)}%` }}
                />
              </div>
              <span>{progress?.current || 0}+ emails</span>
            </div>
          )}
          {lastSynced && !syncing && (
            <p>Last synced: {lastSynced.toLocaleTimeString()}</p>
          )}
          {error && !syncing && (
            <p className="text-red-500">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
