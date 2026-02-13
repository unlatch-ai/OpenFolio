"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

interface FollowUpPerson {
  id: string;
  first_name: string;
  last_name?: string | null;
  avatar_url?: string | null;
  next_followup_at: string;
}

function formatFollowUpDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays}d`;
  return date.toLocaleDateString();
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function FollowUpReminders() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [people, setPeople] = useState<FollowUpPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (workspaceLoading || !currentWorkspace) return;

    const load = async () => {
      setIsLoading(true);
      try {
        // Fetch people with follow-up dates within 7 days or overdue
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const res = await apiFetch(
          `/api/people?limit=10&followup_before=${weekFromNow.toISOString()}`
        );
        if (res.ok) {
          const json = await res.json();
          // Filter to only people with next_followup_at set
          const withFollowups = (json.data || []).filter(
            (p: FollowUpPerson) => p.next_followup_at
          );
          // Sort by date ascending (most urgent first)
          withFollowups.sort(
            (a: FollowUpPerson, b: FollowUpPerson) =>
              new Date(a.next_followup_at).getTime() -
              new Date(b.next_followup_at).getTime()
          );
          setPeople(withFollowups.slice(0, 5));
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

  if (people.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No upcoming follow-ups
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {people.map((person) => {
        const initials =
          ((person.first_name?.[0] || "") + (person.last_name?.[0] || "")).toUpperCase() || "?";
        const overdue = isOverdue(person.next_followup_at);

        return (
          <Link
            key={person.id}
            href={`/app/people/${person.id}`}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted"
          >
            <Avatar size="sm">
              {person.avatar_url && (
                <AvatarImage src={person.avatar_url} />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {person.first_name} {person.last_name || ""}
              </p>
            </div>
            <span
              className={`text-xs shrink-0 ${
                overdue ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
            >
              {formatFollowUpDate(person.next_followup_at)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
