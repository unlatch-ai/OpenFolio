"use client";

import { useEffect, useMemo, useState } from "react";
import { User, Building2, MessageSquare, Pin, PinOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { Person, Company, Interaction } from "@/types";
import {
  PlanItem,
  PlanItemType,
  usePlanSelection,
} from "./PlanSelectionContext";

type SelectionPerson = Pick<
  Person,
  | "id"
  | "email"
  | "first_name"
  | "last_name"
  | "display_name"
  | "relationship_type"
  | "relationship_strength"
  | "last_contacted_at"
  | "location"
  | "bio"
  | "created_at"
  | "updated_at"
>;

type SelectionCompany = Pick<
  Company,
  | "id"
  | "name"
  | "domain"
  | "website"
  | "industry"
  | "location"
  | "description"
  | "created_at"
  | "updated_at"
>;

type SelectionInteraction = Pick<
  Interaction,
  | "id"
  | "interaction_type"
  | "direction"
  | "subject"
  | "content"
  | "summary"
  | "occurred_at"
  | "duration_minutes"
  | "created_at"
>;

type SelectionData = SelectionPerson | SelectionCompany | SelectionInteraction;

type SelectionDetailsState = {
  loading: boolean;
  error: string | null;
  data: SelectionData | null;
};

const typeLabel: Record<PlanItemType, string> = {
  person: "Person",
  company: "Company",
  interaction: "Interaction",
};

const typeIcon: Record<PlanItemType, typeof User> = {
  person: User,
  company: Building2,
  interaction: MessageSquare,
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPersonName(person: SelectionPerson | null) {
  if (!person) return null;
  if (person.display_name) return person.display_name;
  const full = `${person.first_name || ""} ${person.last_name || ""}`.trim();
  return full || person.email || "Person";
}

function formatCompanyName(company: SelectionCompany | null) {
  return company?.name || "Company";
}

function formatInteractionTitle(interaction: SelectionInteraction | null) {
  return interaction?.subject || interaction?.interaction_type || "Interaction";
}

function getLinkForItem(item: PlanItem) {
  switch (item.type) {
    case "person":
      return `/app/people/${item.id}`;
    case "company":
      return `/app/companies/${item.id}`;
    case "interaction":
      return `/app/interactions/${item.id}`;
  }
}

async function fetchDetails(item: PlanItem): Promise<SelectionData | null> {
  const supabase = createClient();
  if (item.type === "person") {
    const { data } = await supabase
      .from("people")
      .select(
        "id,email,first_name,last_name,display_name,relationship_type,relationship_strength,last_contacted_at,location,bio,created_at,updated_at"
      )
      .eq("id", item.id)
      .single();
    return (data as SelectionPerson) || null;
  }
  if (item.type === "company") {
    const { data } = await supabase
      .from("companies")
      .select(
        "id,name,domain,website,industry,location,description,created_at,updated_at"
      )
      .eq("id", item.id)
      .single();
    return (data as SelectionCompany) || null;
  }
  const { data } = await supabase
    .from("interactions")
    .select("id,interaction_type,direction,subject,content,summary,occurred_at,duration_minutes,created_at")
    .eq("id", item.id)
    .single();
  return (data as SelectionInteraction) || null;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "-"}</p>
    </div>
  );
}

function SelectionDetails({ item }: { item: PlanItem }) {
  const selection = usePlanSelection();
  const updateItem = selection?.updateItem;
  const [detailState, setDetailState] = useState<SelectionDetailsState>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let active = true;
    fetchDetails(item)
      .then((data) => {
        if (!active) return;
        setDetailState({ loading: false, error: null, data });
        if (data) {
          const name =
            item.type === "person"
              ? formatPersonName(data as SelectionPerson)
              : item.type === "company"
              ? formatCompanyName(data as SelectionCompany)
              : formatInteractionTitle(data as SelectionInteraction);
          if (name) {
            updateItem?.({ ...item, name });
          }
        }
      })
      .catch((error: Error) => {
        if (!active) return;
        setDetailState({
          loading: false,
          error: error.message || "Failed to load details",
          data: null,
        });
      });
    return () => {
      active = false;
    };
  }, [item, updateItem]);

  const isPinned = selection?.isPinned(item) ?? false;
  const link = getLinkForItem(item);
  const Icon = typeIcon[item.type];

  if (detailState.loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (detailState.error || !detailState.data) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Unable to load details for this {typeLabel[item.type].toLowerCase()}.
      </div>
    );
  }

  const data = detailState.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {typeLabel[item.type]}
          </div>
          <h3 className="text-lg font-semibold">
            {item.type === "person"
              ? formatPersonName(data as SelectionPerson)
              : item.type === "company"
              ? formatCompanyName(data as SelectionCompany)
              : formatInteractionTitle(data as SelectionInteraction)}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isPinned ? "secondary" : "outline"}
            size="sm"
            onClick={() => selection?.togglePin(item)}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {isPinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={link} target="_blank" rel="noreferrer noopener" aria-label="Open in new tab">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {item.type === "person" && (
        <div className="space-y-3">
          <DetailRow label="Email" value={(data as SelectionPerson).email} />
          <DetailRow label="Location" value={(data as SelectionPerson).location} />
          <DetailRow label="Relationship" value={(data as SelectionPerson).relationship_type} />
          <DetailRow
            label="Strength"
            value={
              (data as SelectionPerson).relationship_strength !== null &&
              (data as SelectionPerson).relationship_strength !== undefined
                ? String((data as SelectionPerson).relationship_strength)
                : null
            }
          />
          <DetailRow label="Last contacted" value={formatDate((data as SelectionPerson).last_contacted_at)} />
          <DetailRow label="Bio" value={(data as SelectionPerson).bio} />
          <DetailRow label="Created" value={formatDate((data as SelectionPerson).created_at)} />
        </div>
      )}

      {item.type === "company" && (
        <div className="space-y-3">
          <DetailRow label="Domain" value={(data as SelectionCompany).domain} />
          <DetailRow label="Website" value={(data as SelectionCompany).website} />
          <DetailRow label="Industry" value={(data as SelectionCompany).industry} />
          <DetailRow label="Location" value={(data as SelectionCompany).location} />
          <DetailRow label="Description" value={(data as SelectionCompany).description} />
          <DetailRow label="Created" value={formatDate((data as SelectionCompany).created_at)} />
        </div>
      )}

      {item.type === "interaction" && (
        <div className="space-y-3">
          <DetailRow label="Type" value={(data as SelectionInteraction).interaction_type} />
          <DetailRow label="Direction" value={(data as SelectionInteraction).direction} />
          <DetailRow label="Date" value={formatDate((data as SelectionInteraction).occurred_at)} />
          <DetailRow
            label="Duration"
            value={
              (data as SelectionInteraction).duration_minutes
                ? `${(data as SelectionInteraction).duration_minutes} min`
                : null
            }
          />
          <DetailRow label="Summary" value={(data as SelectionInteraction).summary} />
          <DetailRow label="Content" value={(data as SelectionInteraction).content} />
        </div>
      )}
    </div>
  );
}

function PinnedItemChip({ item }: { item: PlanItem }) {
  const selection = usePlanSelection();
  const Icon = typeIcon[item.type];
  const label = item.name || typeLabel[item.type];
  const isActive = selection?.selectedItem?.id === item.id && selection?.selectedItem?.type === item.type;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selection?.selectItem(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selection?.selectItem(item);
        }
      }}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer ${
        isActive
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-muted-foreground/20 bg-background text-muted-foreground hover:bg-muted/60"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          selection?.togglePin(item);
        }}
        className="ml-1 text-muted-foreground hover:text-primary"
        aria-label={`Unpin ${label}`}
      >
        <PinOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SelectionPanel({ showEmpty }: { showEmpty?: boolean } = {}) {
  const selection = usePlanSelection();

  const pinnedItems = selection?.pinnedItems ?? [];
  const selectedItem = selection?.selectedItem ?? null;

  const hasContent = Boolean(selectedItem) || pinnedItems.length > 0;
  const shouldShowEmpty = showEmpty ?? true;

  const pinnedLabel = useMemo(() => {
    if (pinnedItems.length === 0) return "Pin items to keep them handy.";
    return "Pinned context";
  }, [pinnedItems.length]);

  if (!hasContent && shouldShowEmpty) {
    return (
      <div className="flex h-full w-full flex-col px-4 py-6">
        <p className="text-sm font-medium">Context</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Click a citation to preview details and keep it pinned while you chat.
        </p>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="flex h-full w-full flex-col px-4 py-6">
        <p className="text-sm font-medium">Context</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No context selected yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Context</p>
        <p className="text-xs text-muted-foreground">{pinnedLabel}</p>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {selectedItem ? (
          <SelectionDetails
            key={`${selectedItem.type}:${selectedItem.id}`}
            item={selectedItem}
          />
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Select a pinned item to preview details here.
          </div>
        )}

        {pinnedItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pinned
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => pinnedItems.forEach((item) => selection?.togglePin(item))}
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pinnedItems.map((item) => (
                <PinnedItemChip key={`${item.type}:${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SelectionSidebar() {
  return (
    <aside className="hidden md:flex w-80 border-l bg-background">
      <SelectionPanel />
    </aside>
  );
}
