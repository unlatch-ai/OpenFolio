"use client";

import type { KeyboardEvent } from "react";
import { User, Building2, MessageSquare, ExternalLink } from "lucide-react";
import { usePlanSelection } from "./PlanSelectionContext";

type CitationType = "person" | "company" | "interaction";

interface CitationCardProps {
  type: CitationType;
  id: string;
  name?: string;
}

export function CitationCard({ type, id, name: initialName }: CitationCardProps) {
  const selection = usePlanSelection();
  const displayName = initialName || "Untitled";

  const config: Record<CitationType, { icon: typeof User; link: string }> = {
    person: {
      icon: User,
      link: `/app/people/${id}`,
    },
    company: {
      icon: Building2,
      link: `/app/companies/${id}`,
    },
    interaction: {
      icon: MessageSquare,
      link: `/app/interactions/${id}`,
    },
  };

  const Icon = config[type].icon;
  const link = config[type].link;

  const handleSelect = () => {
    selection?.selectItem({ type, id, name: displayName });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 cursor-pointer"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span>{displayName}</span>
      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="ml-1 inline-flex text-muted-foreground hover:text-primary"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open ${displayName} in a new tab`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}
