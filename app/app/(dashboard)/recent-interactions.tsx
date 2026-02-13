"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InteractionCard,
  type InteractionCardData,
} from "@/components/interaction-card";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

export function RecentInteractions() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [interactions, setInteractions] = useState<InteractionCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/interactions?limit=10");
        if (res.ok) {
          const json = await res.json();
          setInteractions(json.data || []);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [workspaceLoading, currentWorkspace]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No recent interactions. Log your first interaction to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {interactions.map((interaction) => (
        <InteractionCard key={interaction.id} interaction={interaction} />
      ))}
      <div className="pt-2">
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href="/app/interactions">View all interactions</Link>
        </Button>
      </div>
    </div>
  );
}
