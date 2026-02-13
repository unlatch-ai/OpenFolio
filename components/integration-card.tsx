"use client";

import {
  Mail,
  Calendar,
  Users,
  FileSpreadsheet,
  Plug,
  RefreshCw,
  Power,
  PowerOff,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ICON_MAP: Record<string, React.ElementType> = {
  Mail,
  Calendar,
  Users,
  FileSpreadsheet,
  Plug,
};

export interface IntegrationCardProps {
  id: string;
  name: string;
  description: string;
  icon: string;
  auth: string;
  status?: "active" | "paused" | "error" | "disconnected";
  lastSyncedAt?: string | null;
  syncing?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSync?: () => void;
}

const STATUS_VARIANTS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Connected", variant: "default" },
  paused: { label: "Paused", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
  disconnected: { label: "Not Connected", variant: "outline" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function IntegrationCard({
  name,
  description,
  icon,
  auth,
  status = "disconnected",
  lastSyncedAt,
  syncing,
  onConnect,
  onDisconnect,
  onSync,
}: IntegrationCardProps) {
  const Icon = ICON_MAP[icon] || Plug;
  const statusInfo = STATUS_VARIANTS[status] || STATUS_VARIANTS.disconnected;
  const isConnected = status === "active" || status === "paused";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{name}</CardTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {lastSyncedAt && isConnected && (
              <span>Last synced: {timeAgo(lastSyncedAt)}</span>
            )}
          </div>
          <div className="flex gap-2">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDisconnect}
                >
                  <PowerOff className="mr-1 h-3 w-3" />
                  Disconnect
                </Button>
              </>
            ) : auth === "file" ? null : (
              <Button size="sm" onClick={onConnect}>
                <Power className="mr-1 h-3 w-3" />
                Connect
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
