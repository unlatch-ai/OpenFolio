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
  autoSyncEnabled: boolean;
  autoSyncTimeLocal: string;
  autoSyncTimezone: string | null;
  lastSyncError: string | null;
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [savingAutoSyncIds, setSavingAutoSyncIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchIntegrations();
  }, []);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "google") {
      toast.success("Google account connected successfully");
    }
    if (success === "microsoft") {
      toast.success("Microsoft account connected successfully");
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
      return;
    }

    if (
      connectorId === "microsoft-mail" ||
      connectorId === "microsoft-calendar" ||
      connectorId === "microsoft-contacts"
    ) {
      window.location.href = "/api/integrations/microsoft/connect";
    }
  }

  function canDirectlyConnect(connectorId: string): boolean {
    return connectorId === "gmail" || connectorId === "microsoft-mail";
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

  async function saveAutoSync(
    integrationId: string,
    patch: Partial<Pick<IntegrationData, "autoSyncEnabled" | "autoSyncTimeLocal" | "autoSyncTimezone">>
  ) {
    const current = integrations.find((i) => i.integrationId === integrationId);
    if (!current) return;

    const next = {
      autoSyncEnabled: patch.autoSyncEnabled ?? current.autoSyncEnabled,
      autoSyncTimeLocal: patch.autoSyncTimeLocal ?? current.autoSyncTimeLocal,
      autoSyncTimezone:
        patch.autoSyncTimezone === undefined
          ? current.autoSyncTimezone
          : patch.autoSyncTimezone,
    };

    try {
      setSavingAutoSyncIds((prev) => new Set([...prev, integrationId]));
      const response = await apiFetch(`/api/integrations/${integrationId}/autosync`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to save auto-sync settings" }));
        throw new Error(error.error || "Failed to save auto-sync settings");
      }

      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.integrationId === integrationId
            ? { ...integration, ...next }
            : integration
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save auto-sync settings");
      fetchIntegrations();
    } finally {
      setSavingAutoSyncIds((prev) => {
        const nextIds = new Set(prev);
        nextIds.delete(integrationId);
        return nextIds;
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
              autoSyncEnabled={integration.autoSyncEnabled}
              autoSyncTimeLocal={integration.autoSyncTimeLocal}
              autoSyncTimezone={integration.autoSyncTimezone}
              lastSyncError={integration.lastSyncError}
              savingAutoSync={
                integration.integrationId
                  ? savingAutoSyncIds.has(integration.integrationId)
                  : false
              }
              onConnect={canDirectlyConnect(integration.id) ? () => handleConnect(integration.id) : undefined}
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
              onAutoSyncToggle={
                integration.integrationId
                  ? (enabled) =>
                      saveAutoSync(integration.integrationId!, {
                        autoSyncEnabled: enabled,
                      })
                  : undefined
              }
              onAutoSyncTimeChange={
                integration.integrationId
                  ? (value) =>
                      saveAutoSync(integration.integrationId!, {
                        autoSyncTimeLocal: value,
                      })
                  : undefined
              }
              onAutoSyncTimezoneChange={
                integration.integrationId
                  ? (value) =>
                      saveAutoSync(integration.integrationId!, {
                        autoSyncTimezone: value,
                      })
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
