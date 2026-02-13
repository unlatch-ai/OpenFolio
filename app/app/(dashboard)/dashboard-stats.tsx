"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Building2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

type StatsResponse = {
  people: number;
  companies: number;
  interactions: number;
};

const statsConfig = [
  {
    key: "people",
    title: "People",
    description: "Contacts in your network",
    href: "/app/people",
    icon: Users,
  },
  {
    key: "companies",
    title: "Companies",
    description: "Organizations tracked",
    href: "/app/companies",
    icon: Building2,
  },
  {
    key: "interactions",
    title: "Interactions",
    description: "Emails, meetings, messages",
    href: "/app/interactions",
    icon: MessageSquare,
  },
] as const;

export function DashboardStats() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [stats, setStats] = useState<StatsResponse>({ people: 0, companies: 0, interactions: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const workspaceId = currentWorkspace?.id;

  useEffect(() => {
    if (workspaceLoading) return;
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    const loadStats = async () => {
      try {
        setIsLoading(true);
        const response = await apiFetch("/api/dashboard/stats");
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = (await response.json()) as StatsResponse;
        setStats(data);
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [workspaceLoading, workspaceId]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {statsConfig.map((stat) => {
        const Icon = stat.icon;
        const value = isLoading ? "\u2014" : stats[stat.key];
        return (
          <Link key={stat.key} href={stat.href}>
            <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer h-full">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-semibold text-foreground mt-1 font-serif">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                  </div>
                  <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
