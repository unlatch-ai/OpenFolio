import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { upsertIntegrationSchedule, deleteIntegrationSchedule } from "@/lib/integrations/schedule";
import type { Json } from "@/lib/supabase/database.types";

const autosyncSchema = z.object({
  autoSyncEnabled: z.boolean(),
  autoSyncTimeLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  autoSyncTimezone: z.string().min(1).max(100).nullable().optional(),
});

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const payload = await request.json().catch(() => null);
  const parsed = autosyncSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (
    parsed.data.autoSyncTimezone &&
    !isValidTimezone(parsed.data.autoSyncTimezone)
  ) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, metadata")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const updatePayload = {
    auto_sync_enabled: parsed.data.autoSyncEnabled,
    auto_sync_time_local: parsed.data.autoSyncTimeLocal
      ? `${parsed.data.autoSyncTimeLocal}:00`
      : undefined,
    auto_sync_timezone:
      parsed.data.autoSyncTimezone === undefined
        ? undefined
        : parsed.data.autoSyncTimezone,
  };

  const { data, error } = await supabase
    .from("integrations")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select("id, auto_sync_enabled, auto_sync_time_local, auto_sync_timezone")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update autosync" }, { status: 500 });
  }

  // Manage the Trigger.dev schedule
  const existingMeta = (integration.metadata && typeof integration.metadata === "object" && !Array.isArray(integration.metadata))
    ? integration.metadata as Record<string, unknown>
    : {};
  const existingScheduleId = typeof existingMeta.trigger_schedule_id === "string"
    ? existingMeta.trigger_schedule_id
    : null;

  if (parsed.data.autoSyncEnabled) {
    try {
      const timeLocal = data.auto_sync_time_local
        ? (typeof data.auto_sync_time_local === "string" ? data.auto_sync_time_local.slice(0, 5) : "02:00")
        : "02:00";
      const timezone = data.auto_sync_timezone ?? "UTC";
      const scheduleId = await upsertIntegrationSchedule(id, timeLocal, timezone);
      if (scheduleId !== existingScheduleId) {
        await supabase
          .from("integrations")
          .update({ metadata: { ...existingMeta, trigger_schedule_id: scheduleId } as Json })
          .eq("id", id);
      }
    } catch (scheduleError) {
      console.error("Failed to upsert sync schedule", { id, scheduleError });
    }
  } else if (existingScheduleId) {
    try {
      await deleteIntegrationSchedule(existingScheduleId);
      await supabase
        .from("integrations")
        .update({ metadata: { ...existingMeta, trigger_schedule_id: null } as Json })
        .eq("id", id);
    } catch (scheduleError) {
      console.error("Failed to delete sync schedule", { id, scheduleError });
    }
  }

  return NextResponse.json({
    id: data.id,
    autoSyncEnabled: data.auto_sync_enabled,
    autoSyncTimeLocal:
      typeof data.auto_sync_time_local === "string"
        ? data.auto_sync_time_local.slice(0, 5)
        : "02:00",
    autoSyncTimezone: data.auto_sync_timezone,
  });
}
