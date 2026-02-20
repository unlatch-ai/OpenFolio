import { task } from "@trigger.dev/sdk";
import { getConnector } from "@/lib/integrations/registry";
import { processSync } from "@/lib/integrations/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/integrations/encryption";
import type { Json } from "@/lib/supabase/database.types";

export const syncIntegration = task({
  id: "sync-integration",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000 },
  run: async (payload: { integrationId: string; workspaceId: string }) => {
    const supabase = createAdminClient();
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", payload.integrationId)
      .single();

    if (!integration) throw new Error("Integration not found");

    const connector = getConnector(integration.provider);
    if (!connector)
      throw new Error(`Unknown provider: ${integration.provider}`);

    // Log sync start
    const { data: syncLog } = await supabase
      .from("sync_logs")
      .insert({
        integration_id: integration.id,
        workspace_id: payload.workspaceId,
        status: "started",
      })
      .select()
      .single();

    try {
      const result = await connector.sync({
        accessToken: integration.access_token_encrypted
          ? decrypt(integration.access_token_encrypted)
          : undefined,
        refreshToken: integration.refresh_token_encrypted
          ? decrypt(integration.refresh_token_encrypted)
          : undefined,
        cursor: (integration.sync_cursor as Record<string, unknown>) || {},
        metadata: (integration.metadata as Record<string, unknown>) || {},
        workspaceId: payload.workspaceId,
      });

      const summary = await processSync(result, payload.workspaceId);

      // Update sync cursor and last_synced_at
      await supabase
        .from("integrations")
        .update({
          sync_cursor: (result.cursor ?? null) as Json,
          last_synced_at: new Date().toISOString(),
          status: "active",
          last_sync_error: null,
        })
        .eq("id", integration.id);

      // Log sync completion
      if (syncLog) {
        await supabase
          .from("sync_logs")
          .update({
            status: "completed",
            items_synced:
              summary.peopleCreated + summary.peopleUpdated + summary.interactionsCreated,
            items_created:
              summary.peopleCreated + summary.interactionsCreated,
            items_updated: summary.peopleUpdated,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);
      }

      return summary;
    } catch (error) {
      if (syncLog) {
        await supabase
          .from("sync_logs")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);
      }

      await supabase
        .from("integrations")
        .update({
          status: "error",
          last_sync_error:
            error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", integration.id);

      throw error;
    }
  },
});
