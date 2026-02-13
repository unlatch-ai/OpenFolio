"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Search, Loader2 } from "lucide-react";
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
import { PersonCard, type PersonCardData } from "@/components/person-card";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import Link from "next/link";

const RELATIONSHIP_TYPES = [
  { value: "all", label: "All types" },
  { value: "friend", label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "mentor", label: "Mentor" },
  { value: "mentee", label: "Mentee" },
  { value: "client", label: "Client" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Other" },
];

export default function PeoplePage() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [people, setPeople] = useState<PersonCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [relationshipType, setRelationshipType] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const fetchPeople = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (relationshipType !== "all")
        params.set("relationship_type", relationshipType);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "24");

      const res = await apiFetch(`/api/people?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    [search, relationshipType]
  );

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const json = await fetchPeople();
        if (!cancelled) {
          setPeople(json.data || []);
          setNextCursor(json.nextCursor || null);
          setHasMore(json.hasMore || false);
        }
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceLoading, currentWorkspace, fetchPeople]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await fetchPeople(nextCursor);
      setPeople((prev) => [...prev, ...(json.data || [])]);
      setNextCursor(json.nextCursor || null);
      setHasMore(json.hasMore || false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddPerson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddLoading(true);
    const formData = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim()) {
        body[key] = value.trim();
      }
    }

    try {
      const res = await apiFetch("/api/people", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        // Refresh list
        const json = await fetchPeople();
        setPeople(json.data || []);
        setNextCursor(json.nextCursor || null);
        setHasMore(json.hasMore || false);
      }
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground">
            People
          </h1>
          <p className="text-muted-foreground mt-1">
            Contacts in your network
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Person</DialogTitle>
              <DialogDescription>
                Add a new contact to your network.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddPerson} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name *</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    required
                    placeholder="Alice"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    placeholder="Smith"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="alice@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="+1 555-0123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="New York, NY"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addLoading}>
                  {addLoading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Add Person
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
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={relationshipType} onValueChange={setRelationshipType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATIONSHIP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : people.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-2">
              No people yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Import a CSV to add contacts, or add them one by one.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link href="/app/settings/import">Import CSV</Link>
              </Button>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Person
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => (
              <PersonCard key={person.id} person={person} />
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
