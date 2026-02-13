"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

interface PersonTag {
  tags: {
    id: string;
    name: string;
    color: string | null;
  };
}

interface PersonCompany {
  companies: {
    id: string;
    name: string;
  };
  role?: string;
}

export interface PersonCardData {
  id: string;
  first_name: string;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  location?: string | null;
  relationship_type?: string | null;
  relationship_strength?: number | null;
  last_contacted_at?: string | null;
  person_tags?: PersonTag[];
  person_companies?: PersonCompany[];
}

function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName?.[0] || "";
  const last = lastName?.[0] || "";
  return (first + last).toUpperCase() || "?";
}

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
  return `${Math.floor(diffDays / 365)}y ago`;
}

function strengthColor(strength: number | null | undefined): string {
  if (!strength) return "bg-muted";
  if (strength >= 0.7) return "bg-green-500";
  if (strength >= 0.4) return "bg-yellow-500";
  return "bg-red-400";
}

export function PersonCard({ person }: { person: PersonCardData }) {
  const displayName =
    person.display_name ||
    `${person.first_name} ${person.last_name || ""}`.trim();
  const company = person.person_companies?.[0];
  const tags = person.person_tags?.slice(0, 3) || [];

  return (
    <Link href={`/app/people/${person.id}`}>
      <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar>
              {person.avatar_url ? (
                <AvatarImage src={person.avatar_url} alt={displayName} />
              ) : null}
              <AvatarFallback>
                {getInitials(person.first_name, person.last_name) || (
                  <User className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate">
                  {displayName}
                </p>
                {person.relationship_strength != null && (
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${strengthColor(person.relationship_strength)}`}
                    title={`Strength: ${Math.round(person.relationship_strength * 100)}%`}
                  />
                )}
              </div>
              {company && (
                <p className="text-sm text-muted-foreground truncate">
                  {company.role ? `${company.role} at ` : ""}
                  {company.companies.name}
                </p>
              )}
              {!company && person.email && (
                <p className="text-sm text-muted-foreground truncate">
                  {person.email}
                </p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <Badge
                      key={t.tags.id}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                      style={
                        t.tags.color
                          ? {
                              backgroundColor: `${t.tags.color}20`,
                              color: t.tags.color,
                              borderColor: `${t.tags.color}40`,
                            }
                          : undefined
                      }
                    >
                      {t.tags.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {person.last_contacted_at && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatRelativeTime(person.last_contacted_at)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
