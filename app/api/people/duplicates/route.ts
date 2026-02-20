import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const supabase = createAdminClient();

  const { data: candidates, error } = await supabase
    .from("duplicate_candidates" as never)
    .select(
      `
      id,
      confidence,
      reason,
      status,
      created_at,
      person_a:people!duplicate_candidates_person_a_id_fkey(id, first_name, last_name, email, phone, avatar_url),
      person_b:people!duplicate_candidates_person_b_id_fkey(id, first_name, last_name, email, phone, avatar_url)
    `
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "pending")
    .order("confidence", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: candidates || [] });
}
