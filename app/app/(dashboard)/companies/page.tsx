"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, Search, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CompanyCard, type CompanyCardData } from "@/components/company-card";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

export default function CompaniesPage() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [companies, setCompanies] = useState<CompanyCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const fetchCompanies = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "24");

      const res = await apiFetch(`/api/companies?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    [search]
  );

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const json = await fetchCompanies();
        if (!cancelled) {
          setCompanies(json.data || []);
          setNextCursor(json.nextCursor || null);
          setHasMore(json.hasMore || false);
        }
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceLoading, currentWorkspace, fetchCompanies]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await fetchCompanies(nextCursor);
      setCompanies((prev) => [...prev, ...(json.data || [])]);
      setNextCursor(json.nextCursor || null);
      setHasMore(json.hasMore || false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent<HTMLFormElement>) => {
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
      const res = await apiFetch("/api/companies", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        const json = await fetchCompanies();
        setCompanies(json.data || []);
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
            Companies
          </h1>
          <p className="text-muted-foreground mt-1">
            Organizations in your network
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Company</DialogTitle>
              <DialogDescription>
                Add a new organization to your network.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddCompany} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company name *</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  name="domain"
                  placeholder="acme.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    name="industry"
                    placeholder="Technology"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="San Francisco"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addLoading}>
                  {addLoading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Add Company
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-2">
              No companies yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Companies will appear here as you add contacts with company
              associations, or add them directly.
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => (
              <CompanyCard key={company.id} company={company} />
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
