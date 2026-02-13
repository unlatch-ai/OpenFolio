"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";
import { MergeSuggestion } from "./merge-suggestion";

interface DuplicateData {
  id: string;
  confidence: number;
  reason: string;
  person_a: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  person_b: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
}

export function DuplicateReview() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [candidates, setCandidates] = useState<DuplicateData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCandidates = async () => {
    try {
      const res = await apiFetch("/api/people/duplicates");
      if (res.ok) {
        const json = await res.json();
        setCandidates(json.data || []);
      }
    } catch {
      // Silently fail — duplicates are non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;
    fetchCandidates();
  }, [workspaceLoading, currentWorkspace]);

  if (loading || candidates.length === 0) {
    return null;
  }

  const displayed = candidates.slice(0, 5);

  return (
    <div className="space-y-3">
      {displayed.map((c) => (
        <MergeSuggestion
          key={c.id}
          candidateId={c.id}
          personA={c.person_a}
          personB={c.person_b}
          confidence={c.confidence}
          reason={c.reason}
          onResolved={fetchCandidates}
        />
      ))}
    </div>
  );
}
