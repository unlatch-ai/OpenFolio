"use client";

import {
  InteractionCard,
  type InteractionCardData,
} from "@/components/interaction-card";

interface TimelineViewProps {
  interactions: InteractionCardData[];
  showParticipants?: boolean;
}

function groupByDate(
  interactions: InteractionCardData[]
): Map<string, InteractionCardData[]> {
  const groups = new Map<string, InteractionCardData[]>();
  for (const interaction of interactions) {
    const date = new Date(interaction.occurred_at);
    const key = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(interaction);
  }
  return groups;
}

export function TimelineView({
  interactions,
  showParticipants = true,
}: TimelineViewProps) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No interactions yet
      </p>
    );
  }

  const groups = groupByDate(interactions);

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([date, items]) => (
        <div key={date}>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {date}
          </h4>
          <div className="space-y-2">
            {items.map((interaction) => (
              <InteractionCard
                key={interaction.id}
                interaction={interaction}
                showParticipants={showParticipants}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
