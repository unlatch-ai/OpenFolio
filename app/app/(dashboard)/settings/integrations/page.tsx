"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plug } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { IntegrationCard } from "@/components/integration-card";
import { toast } from "sonner";

interface IntegrationData {
  id: string;
  name: string;
  description: string;
  icon: string;
  auth: string;
  integrationId: string | null;
  status: string;
  lastSyncedAt: string | null;
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchIntegrations();
  }, []);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "google") {
      toast.success("Google account connected successfully");
    }
    if (error) {
      toast.error(`Connection failed: ${error}`);
    }
  }, [searchParams]);

  async function fetchIntegrations() {
    try {
      setLoading(true);
      const response = await apiFetch("/api/integrations");
      if (!response.ok) {
        throw new Error("Failed to load integrations");
      }
      const data = (await response.json()) as IntegrationData[];
      setIntegrations(data);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(connectorId: string) {
    if (connectorId === "gmail" || connectorId === "google-calendar" || connectorId === "google-contacts") {
      window.location.href = "/api/integrations/google/connect";
    }
  }

  async function handleDisconnect(integrationId: string) {
    if (!confirm("Are you sure you want to disconnect this integration?")) return;
    try {
      await apiFetch(`/api/integrations/${integrationId}/disconnect`, {
        method: "POST",
      });
      toast.success("Integration disconnected");
      fetchIntegrations();
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  async function handleSync(integrationId: string) {
    try {
      setSyncingIds((prev) => new Set([...prev, integrationId]));
      await apiFetch(`/api/integrations/${integrationId}/sync`, {
        method: "POST",
      });
      toast.success("Sync started");
    } catch {
      toast.error("Failed to start sync");
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(integrationId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">
            Connect external services to sync contacts and interactions.
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect external services to sync contacts and interactions.
        </p>
      </div>

      {integrations.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
          <Plug className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">No integrations available</h3>
            <p className="text-sm text-muted-foreground">
              Integrations will appear here as they become available.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              id={integration.id}
              name={integration.name}
              description={integration.description}
              icon={integration.icon}
              auth={integration.auth}
              status={
                (integration.status as "active" | "paused" | "error" | "disconnected") ||
                "disconnected"
              }
              lastSyncedAt={integration.lastSyncedAt}
              syncing={
                integration.integrationId
                  ? syncingIds.has(integration.integrationId)
                  : false
              }
              onConnect={() => handleConnect(integration.id)}
              onDisconnect={
                integration.integrationId
                  ? () => handleDisconnect(integration.integrationId!)
                  : undefined
              }
              onSync={
                integration.integrationId
                  ? () => handleSync(integration.integrationId!)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
