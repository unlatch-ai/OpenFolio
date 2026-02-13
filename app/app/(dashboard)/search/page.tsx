"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Search,
  Users,
  Building2,
  MessageSquare,
  ArrowRight,
  AlertCircle,
  X
} from "lucide-react";
import { toast } from "sonner";
import type { SearchResponse, SearchResult } from "@/types";

const entityTypeConfig: Record<string, {
  label: string;
  icon: typeof Users;
  color: string;
  route: string;
}> = {
  person: {
    label: "Person",
    icon: Users,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    route: "/app/people",
  },
  company: {
    label: "Company",
    icon: Building2,
    color: "bg-sky-50 text-sky-700 border-sky-200",
    route: "/app/companies",
  },
  interaction: {
    label: "Interaction",
    icon: MessageSquare,
    color: "bg-violet-50 text-violet-700 border-violet-200",
    route: "/app/interactions",
  },
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["people", "companies", "interactions"]);
  const activeRequestRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    if (selectedTypes.length === 0) {
      toast.error("Please select at least one entity type");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
    }
    const controller = new AbortController();
    activeRequestRef.current = controller;

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query,
          entity_types: selectedTypes,
          limit: 20,
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      console.error("Error searching:", error);
      toast.error("Failed to perform search");
    } finally {
      if (activeRequestRef.current === controller) {
        setIsLoading(false);
        activeRequestRef.current = null;
      }
    }
  }, [query, selectedTypes]);

  const toggleEntityType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }
  };

  const navigateToResult = (result: SearchResult) => {
    const config = entityTypeConfig[result.type];
    if (!config) return;
    const id = (result.data as { id: string }).id;
    window.location.href = `${config.route}/${id}`;
  };

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      if (activeRequestRef.current) {
        activeRequestRef.current.abort();
        activeRequestRef.current = null;
      }
      return;
    }

    const timeoutId = window.setTimeout(() => {
      handleSearch();
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, selectedTypes, handleSearch]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground">
          Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Find people, companies, and interactions using semantic search
        </p>
      </header>

      {/* Search Input */}
      <Card className="overflow-hidden">
        <CardContent className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search for people, companies, interactions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 pr-12 h-12 text-base"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Entity Type Filters */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Search in:</span>
            {[
              { value: "people", label: "People", icon: Users },
              { value: "companies", label: "Companies", icon: Building2 },
              { value: "interactions", label: "Interactions", icon: MessageSquare },
            ].map(({ value, label, icon: Icon }) => (
              <div key={value} className="flex items-center space-x-2">
                <Checkbox
                  id={value}
                  checked={selectedTypes.includes(value)}
                  onCheckedChange={() => toggleEntityType(value)}
                />
                <Label
                  htmlFor={value}
                  className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {label}
                </Label>
              </div>
            ))}
          </div>

        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-8">
          {isLoading ? (
            <LoadingState />
          ) : results.length > 0 ? (
            <>
              {/* Results Summary */}
              <p className="text-sm text-muted-foreground">
                Found <span className="font-medium text-foreground">{results.length}</span> results
                {query && (
                  <span> for &quot;<span className="font-medium text-foreground">{query}</span>&quot;</span>
                )}
              </p>

              {/* Results by Type */}
              {Object.entries(groupedResults).map(([type, typeResults]) => {
                const config = entityTypeConfig[type as keyof typeof entityTypeConfig];
                if (!config) return null;
                const Icon = config.icon;

                return (
                  <section key={type} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <h2 className="text-lg font-medium text-foreground">
                        {config.label}s
                      </h2>
                      <Badge variant="secondary" className="font-normal">{typeResults.length}</Badge>
                    </div>
                    <div className="grid gap-3">
                      {typeResults.map((result, index) => (
                        <SearchResultCard
                          key={`${result.type}-${(result.data as { id: string }).id || index}`}
                          result={result}
                          onClick={() => navigateToResult(result)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          ) : (
            <EmptyState query={query} onClear={clearSearch} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({
  result,
  onClick
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  const config = entityTypeConfig[result.type];
  if (!config) return null;
  const Icon = config.icon;

  const getTitle = () => {
    switch (result.type) {
      case "person": {
        const person = result.data as { first_name?: string; last_name?: string; email?: string };
        const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
        return name || person.email || "Unknown";
      }
      case "company":
        return (result.data as { name: string }).name;
      case "interaction":
        return (result.data as { subject?: string }).subject || "Untitled interaction";
      default:
        return "Unknown";
    }
  };

  const getSubtitle = () => {
    switch (result.type) {
      case "person": {
        const person = result.data as { email?: string; title?: string };
        const parts = [];
        if (person.title) parts.push(person.title);
        if (person.email) parts.push(person.email);
        return parts.join(" - ") || "No details available";
      }
      case "company": {
        const company = result.data as { industry?: string; domain?: string };
        const parts = [];
        if (company.industry) parts.push(company.industry);
        if (company.domain) parts.push(company.domain);
        return parts.join(" - ") || "Company";
      }
      case "interaction": {
        const interaction = result.data as { type?: string; occurred_at?: string };
        const parts = [];
        if (interaction.type) parts.push(interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1));
        if (interaction.occurred_at) parts.push(new Date(interaction.occurred_at).toLocaleDateString());
        return parts.join(" - ") || "Interaction";
      }
      default:
        return "";
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-sm group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {getTitle()}
                </h4>
                <Badge variant="outline" className={`text-xs font-normal ${config.color}`}>
                  {config.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {getSubtitle()}
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-secondary rounded-md animate-pulse shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-5 bg-secondary rounded w-1/3 animate-pulse" />
                <div className="h-4 bg-secondary rounded w-2/3 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-2">No results found</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          We couldn&apos;t find any matches for &quot;{query}&quot;.
          Try using different keywords or checking your spelling.
        </p>
        <Button variant="outline" onClick={onClear}>
          Clear Search
        </Button>
      </CardContent>
    </Card>
  );
}
