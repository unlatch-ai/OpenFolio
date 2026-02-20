import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { mergePeople } from "@/lib/dedup";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const mergeSchema = z.object({
  keep_id: z.string().uuid(),
  merge_id: z.string().uuid(),
  candidate_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = await request.json();
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { keep_id, merge_id, candidate_id } = parsed.data;

  if (keep_id === merge_id) {
    return NextResponse.json(
      { error: "Cannot merge a person with themselves" },
      { status: 400 }
    );
  }

  const result = await mergePeople(keep_id, merge_id, ctx.workspaceId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Mark candidate as resolved if provided
  if (candidate_id) {
    const supabase = createAdminClient();
    await supabase
      .from("duplicate_candidates" as never)
      .update({ status: "merged" } as never)
      .eq("id", candidate_id)
      .eq("workspace_id", ctx.workspaceId);
  }

  return NextResponse.json({ success: true });
}
