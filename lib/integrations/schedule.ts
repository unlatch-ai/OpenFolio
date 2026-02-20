import { schedules } from "@trigger.dev/sdk";

export const SYNC_SCHEDULE_TASK_ID = "sync-integration-scheduled";

function toCron(timeLocal: string): string {
  const [h, m] = timeLocal.split(":").map(Number);
  return `${m} ${h} * * *`;
}

/**
 * Creates or updates the daily sync schedule for an integration.
 * Uses deduplicationKey so reconnects and setting changes are idempotent.
 * Returns the Trigger.dev schedule ID to store in integrations.metadata.
 */
export async function upsertIntegrationSchedule(
  integrationId: string,
  timeLocal = "02:00",
  timezone = "UTC"
): Promise<string> {
  const schedule = await schedules.create({
    task: SYNC_SCHEDULE_TASK_ID,
    cron: toCron(timeLocal),
    timezone,
    externalId: integrationId,
    deduplicationKey: `integration-daily-sync:${integrationId}`,
  });
  return schedule.id;
}

/**
 * Deletes the daily sync schedule for an integration.
 * Safe to call even if the schedule no longer exists.
 */
export async function deleteIntegrationSchedule(scheduleId: string): Promise<void> {
  try {
    await schedules.del(scheduleId);
  } catch {
    // Already deleted or never existed — not an error
  }
}
