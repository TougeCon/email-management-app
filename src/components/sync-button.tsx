"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw } from "lucide-react";

interface SyncButtonProps {
  accountId?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function SyncButton({ accountId, variant = "default", size = "default" }: SyncButtonProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();

      if (data.success) {
        const total = data.totalEmailsSynced || 0;
        toast({
          title: "Sync complete",
          description: `Synced ${total} email${total !== 1 ? "s" : ""}`,
        });
        // Refresh the page to show new emails
        window.location.reload();
      } else {
        toast({
          title: "Sync failed",
          description: data.error || "Failed to sync emails",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Sync error",
        description: "Failed to connect to sync service",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSync}
      disabled={syncing}
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing..." : "Sync Emails"}
    </Button>
  );
}
