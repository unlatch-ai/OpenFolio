"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Plus, Search, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InteractionCard,
  type InteractionCardData,
} from "@/components/interaction-card";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

const INTERACTION_TYPES = [
  { value: "all", label: "All types" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "message", label: "Message" },
  { value: "coffee", label: "Coffee" },
  { value: "other", label: "Other" },
];

const DIRECTIONS = [
  { value: "all", label: "All directions" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "mutual", label: "Mutual" },
];

export default function InteractionsPage() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [interactions, setInteractions] = useState<InteractionCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [interactionType, setInteractionType] = useState("all");
  const [direction, setDirection] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const fetchInteractions = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (interactionType !== "all")
        params.set("interaction_type", interactionType);
      if (direction !== "all") params.set("direction", direction);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const res = await apiFetch(`/api/interactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    [search, interactionType, direction]
  );

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const json = await fetchInteractions();
        if (!cancelled) {
          setInteractions(json.data || []);
          setNextCursor(json.nextCursor || null);
          setHasMore(json.hasMore || false);
        }
      } catch {
        if (!cancelled) setInteractions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceLoading, currentWorkspace, fetchInteractions]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await fetchInteractions(nextCursor);
      setInteractions((prev) => [...prev, ...(json.data || [])]);
      setNextCursor(json.nextCursor || null);
      setHasMore(json.hasMore || false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddLoading(true);
    const formData = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim()) {
        body[key] = value.trim();
      }
    }
    // Ensure occurred_at is ISO
    if (body.occurred_at) {
      body.occurred_at = new Date(body.occurred_at as string).toISOString();
    }

    try {
      const res = await apiFetch("/api/interactions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        const json = await fetchInteractions();
        setInteractions(json.data || []);
        setNextCursor(json.nextCursor || null);
        setHasMore(json.hasMore || false);
      }
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground">
            Interactions
          </h1>
          <p className="text-muted-foreground mt-1">
            Emails, meetings, and messages
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Interaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Interaction</DialogTitle>
              <DialogDescription>
                Record a new interaction with someone in your network.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddInteraction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interaction_type">Type *</Label>
                  <select
                    id="interaction_type"
                    name="interaction_type"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                    <option value="call">Call</option>
                    <option value="message">Message</option>
                    <option value="coffee">Coffee</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="direction">Direction</Label>
                  <select
                    id="direction"
                    name="direction"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="">None</option>
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                    <option value="mutual">Mutual</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Quarterly review"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurred_at">Date *</Label>
                <Input
                  id="occurred_at"
                  name="occurred_at"
                  type="datetime-local"
                  required
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  name="notes"
                  placeholder="Brief summary..."
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addLoading}>
                  {addLoading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Log Interaction
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search interactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={interactionType} onValueChange={setInteractionType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERACTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : interactions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-2">
              No interactions yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Log emails, meetings, and messages to track your relationships.
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Log Interaction
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {interactions.map((interaction) => (
              <InteractionCard
                key={interaction.id}
                interaction={interaction}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
