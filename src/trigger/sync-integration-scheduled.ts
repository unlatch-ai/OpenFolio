import { schedules } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncIntegration } from "./sync-integration";

export const syncIntegrationScheduled = schedules.task({
  id: "sync-integration-scheduled",
  run: async (payload) => {
    const integrationId = payload.externalId;
    if (!integrationId) {
      console.error("sync-integration-scheduled: missing externalId");
      return { skipped: true };
    }

    const supabase = createAdminClient();
    const { data: integration } = await supabase
      .from("integrations")
      .select("workspace_id, status")
      .eq("id", integrationId)
      .single();

    if (!integration) {
      console.error("sync-integration-scheduled: integration not found", integrationId);
      return { skipped: true };
    }

    if (integration.status !== "active") {
      return { skipped: true, reason: `status is ${integration.status}` };
    }

    await syncIntegration.trigger({
      integrationId,
      workspaceId: integration.workspace_id,
    });

    return { triggered: true, integrationId };
  },
});
