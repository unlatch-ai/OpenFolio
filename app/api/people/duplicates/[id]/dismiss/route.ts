import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("duplicate_candidates" as never)
    .update({ status: "dismissed" } as never)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    return NextResponse.json({ error: "Failed to dismiss" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
