import { schedules, tasks } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { syncIntegration } from "./sync-integration";

const SCHEDULER_CRON = "*/5 * * * *";

function normalizeTime(value: string | null | undefined): string {
  if (!value) return "02:00";
  return value.slice(0, 5);
}

function formatLocalParts(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;

  const year = get("year") || "1970";
  const month = get("month") || "01";
  const day = get("day") || "01";
  const hour = get("hour") || "00";
  const minute = get("minute") || "00";

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function resolveTimezone(
  integrationTimezone: string | null,
  workspaceSettings: unknown
): string {
  const isValidTimezone = (value: string) => {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  };

  if (integrationTimezone && isValidTimezone(integrationTimezone)) {
    return integrationTimezone;
  }

  if (workspaceSettings && typeof workspaceSettings === "object") {
    const settings = workspaceSettings as Record<string, unknown>;
    const timezone = settings.timezone;
    if (
      typeof timezone === "string" &&
      timezone.length > 0 &&
      isValidTimezone(timezone)
    ) {
      return timezone;
    }
  }

  return "UTC";
}

export const scheduleIntegrationSyncs = schedules.task({
  id: "schedule-integration-syncs",
  cron: SCHEDULER_CRON,
  run: async () => {
    const now = new Date();
    const supabase = createAdminClient();

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select(
        "id, workspace_id, auto_sync_enabled, auto_sync_time_local, auto_sync_timezone, status, workspaces:workspace_id ( settings )"
      )
      .eq("auto_sync_enabled", true)
      .eq("status", "active");

    if (error) {
      throw new Error(`Failed to query integrations: ${error.message}`);
    }

    let triggered = 0;

    for (const integration of integrations || []) {
      const workspaceSettings = Array.isArray(integration.workspaces)
        ? integration.workspaces[0]?.settings
        : integration.workspaces?.settings;
      const timezone = resolveTimezone(
        integration.auto_sync_timezone,
        workspaceSettings
      );
      const local = formatLocalParts(now, timezone);
      const targetTime = normalizeTime(integration.auto_sync_time_local);

      if (local.time !== targetTime) {
        continue;
      }

      try {
        await tasks.trigger<typeof syncIntegration>(
          "sync-integration",
          {
            integrationId: integration.id,
            workspaceId: integration.workspace_id,
          },
          {
            idempotencyKey: `autosync:${integration.id}:${local.date}`,
          }
        );
        triggered++;
      } catch (triggerError) {
        console.error("Failed to trigger scheduled sync", {
          integrationId: integration.id,
          error:
            triggerError instanceof Error
              ? triggerError.message
              : "Unknown error",
        });
      }
    }

    return { triggered };
  },
});

export const __testables__ = {
  normalizeTime,
  formatLocalParts,
  resolveTimezone,
};
