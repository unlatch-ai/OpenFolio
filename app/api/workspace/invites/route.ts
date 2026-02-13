import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError, requireOwner } from "@/lib/auth";
import { sendWorkspaceInviteEmail } from "@/lib/email";
import { hashInviteToken, getInviteExpiry, isInviteExpired } from "@/lib/invites";
import { z } from "zod";
import crypto from "crypto";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "member"]).default("member"),
});

/**
 * GET /api/org/invites - List pending invites for current org
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    const { data: invites, error } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invites:", error);
      return NextResponse.json(
        { error: "Failed to fetch invites" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invites: invites || [] });
  } catch (error) {
    console.error("Error in invites API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org/invites - Create a new invite
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    if (!requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Only owners can create invites" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createInviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const supabase = await createClient();

    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", ctx.workspaceId);

    const memberIds = (members || []).map((m) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabase.from("profiles").select("email").in("id", memberIds)
      : { data: [] as { email?: string | null }[] };

    const alreadyMember = (memberProfiles || []).some(
      (member) => member.email?.toLowerCase() === normalizedEmail
    );

    if (alreadyMember) {
      return NextResponse.json(
        { error: "User is already a member of this workspace" },
        { status: 409 }
      );
    }

    // Check if invite already exists
    const { data: existingInvite } = await supabase
      .from("workspace_invites")
      .select("id, expires_at, accepted_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingInvite && !existingInvite.accepted_at && !isInviteExpired(existingInvite.expires_at)) {
      return NextResponse.json(
        { error: "An invite for this email already exists" },
        { status: 409 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = getInviteExpiry(7);

    const upsertPayload = {
      workspace_id: ctx.workspaceId,
      email: normalizedEmail,
      role,
      invited_by: ctx.user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
      accepted_at: null,
    };

    const { data: invite, error } = existingInvite
      ? await supabase
          .from("workspace_invites")
          .update(upsertPayload)
          .eq("id", existingInvite.id)
          .select()
          .single()
      : await supabase
          .from("workspace_invites")
          .insert(upsertPayload)
          .select()
          .single();

    if (error) {
      console.error("Error creating invite:", error);
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      );
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const inviteLink = `${appUrl}/invite?token=${token}`;

    try {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", ctx.workspaceId)
        .single();

      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.user.id)
        .single();

      await sendWorkspaceInviteEmail({
        to: normalizedEmail,
        workspaceName: workspace?.name || "Workspace",
        inviterName: inviterProfile?.full_name,
        role,
        inviteLink,
      });
    } catch (emailError) {
      console.error("Error sending invite email:", emailError);
    }

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    console.error("Error in invites API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
