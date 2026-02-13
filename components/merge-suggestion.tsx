"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface PersonSummary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export interface MergeSuggestionProps {
  candidateId: string;
  personA: PersonSummary;
  personB: PersonSummary;
  confidence: number;
  reason: string;
  onResolved?: () => void;
}

function getInitials(firstName: string | null, lastName?: string | null): string {
  return ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "?";
}

function PersonPreview({ person }: { person: PersonSummary }) {
  const name = `${person.first_name} ${person.last_name || ""}`.trim();
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Avatar className="h-12 w-12">
        {person.avatar_url && (
          <AvatarImage src={person.avatar_url} alt={name} />
        )}
        <AvatarFallback>
          {getInitials(person.first_name, person.last_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        {person.email && (
          <p className="text-xs text-muted-foreground truncate">
            {person.email}
          </p>
        )}
        {person.phone && (
          <p className="text-xs text-muted-foreground">{person.phone}</p>
        )}
      </div>
    </div>
  );
}

export function MergeSuggestion({
  candidateId,
  personA,
  personB,
  confidence,
  reason,
  onResolved,
}: MergeSuggestionProps) {
  const [loading, setLoading] = useState(false);

  const handleMerge = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/people/merge", {
        method: "POST",
        body: JSON.stringify({
          keep_id: personA.id,
          merge_id: personB.id,
          candidate_id: candidateId,
        }),
      });
      if (res.ok) {
        toast.success("Contacts merged successfully");
        onResolved?.();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to merge");
      }
    } catch {
      toast.error("Failed to merge contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/people/duplicates/${candidateId}/dismiss`, {
        method: "POST",
      });
      toast.success("Dismissed");
      onResolved?.();
    } catch {
      toast.error("Failed to dismiss");
    } finally {
      setLoading(false);
    }
  };

  const confidencePercent = Math.round(confidence * 100);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">{reason}</p>
          <Badge variant="secondary" className="text-xs">
            {confidencePercent}% match
          </Badge>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <PersonPreview person={personA} />
          <div className="text-muted-foreground text-xs font-medium">=</div>
          <PersonPreview person={personB} />
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            size="sm"
            className="flex-1"
            onClick={handleMerge}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Check className="h-3 w-3 mr-1" />
            )}
            Same person
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handleDismiss}
            disabled={loading}
          >
            <X className="h-3 w-3 mr-1" />
            Not the same
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
