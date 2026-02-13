"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  Video,
  MessageSquare,
  Coffee,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
} from "lucide-react";

export interface InteractionCardData {
  id: string;
  interaction_type: string;
  subject?: string | null;
  notes?: string | null;
  direction?: string | null;
  occurred_at: string;
  duration_minutes?: number | null;
  interaction_people?: Array<{
    people?: {
      id: string;
      first_name: string;
      last_name?: string | null;
    };
  }>;
}

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Mail; label: string; color: string }
> = {
  email: { icon: Mail, label: "Email", color: "text-blue-500" },
  call: { icon: Phone, label: "Call", color: "text-green-500" },
  meeting: { icon: Video, label: "Meeting", color: "text-purple-500" },
  message: { icon: MessageSquare, label: "Message", color: "text-orange-500" },
  coffee: { icon: Coffee, label: "Coffee", color: "text-amber-600" },
  other: { icon: Calendar, label: "Other", color: "text-gray-500" },
};

const DIRECTION_ICONS: Record<string, typeof ArrowUpRight> = {
  outbound: ArrowUpRight,
  inbound: ArrowDownLeft,
  mutual: ArrowLeftRight,
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return date.toLocaleDateString();
}

export function InteractionCard({
  interaction,
  showParticipants = true,
}: {
  interaction: InteractionCardData;
  showParticipants?: boolean;
}) {
  const config =
    TYPE_CONFIG[interaction.interaction_type] || TYPE_CONFIG.other;
  const Icon = config.icon;
  const DirectionIcon = interaction.direction
    ? DIRECTION_ICONS[interaction.direction]
    : null;

  const participants = interaction.interaction_people
    ?.map((ip) =>
      ip.people
        ? `${ip.people.first_name} ${ip.people.last_name || ""}`.trim()
        : null
    )
    .filter(Boolean);

  return (
    <Link href={`/app/interactions/${interaction.id}`}>
      <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0`}
            >
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate text-sm">
                  {interaction.subject || config.label}
                </p>
                {DirectionIcon && (
                  <DirectionIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
              {showParticipants && participants && participants.length > 0 && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {participants.join(", ")}
                </p>
              )}
              {interaction.notes && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {interaction.notes}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {config.label}
                </Badge>
                {interaction.duration_minutes && (
                  <span className="text-[10px] text-muted-foreground">
                    {interaction.duration_minutes}min
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(interaction.occurred_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
