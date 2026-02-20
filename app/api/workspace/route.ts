import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext, isWorkspaceContextError, requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/workspace - Get current user's workspace
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = createAdminClient();

    // Get workspace details
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", ctx.workspaceId)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Error in workspace API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/workspace - Update workspace
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const { name, description, website, logo_url, custom_instructions } = body;

    const supabase = createAdminClient();

    const hasWorkspaceUpdates = [name, description, website, logo_url].some(
      (value) => value !== undefined
    );
    const hasCustomInstructionsUpdate = custom_instructions !== undefined;

    if (!hasWorkspaceUpdates && !hasCustomInstructionsUpdate) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    // Only owners can update core workspace fields
    if (hasWorkspaceUpdates && !requireOwner(ctx)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (hasWorkspaceUpdates) {
      updates.updated_at = new Date().toISOString();
    }

    if (name !== undefined) {
      updates.name = name;
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (website !== undefined) {
      updates.website = website;
    }
    if (logo_url !== undefined) {
      updates.logo_url = logo_url;
    }

    if (hasCustomInstructionsUpdate) {
      const { data: existingWorkspace, error: existingError } = await supabase
        .from("workspaces")
        .select("settings")
        .eq("id", ctx.workspaceId)
        .single();

      if (existingError) {
        console.error("Error loading workspace settings:", existingError);
        return NextResponse.json(
          { error: "Failed to update workspace" },
          { status: 500 }
        );
      }

      const existingSettings =
        existingWorkspace?.settings &&
        typeof existingWorkspace.settings === "object" &&
        !Array.isArray(existingWorkspace.settings)
          ? (existingWorkspace.settings as Record<string, unknown>)
          : {};

      const nextSettings = { ...existingSettings };
      if (typeof custom_instructions === "string") {
        const trimmed = custom_instructions.trim();
        if (trimmed.length === 0) {
          delete nextSettings.custom_instructions;
        } else {
          nextSettings.custom_instructions = custom_instructions;
        }
      } else if (custom_instructions === null) {
        delete nextSettings.custom_instructions;
      }

      updates.settings = nextSettings;
    }

    // Update workspace
    const { data: workspace, error } = await supabase
      .from("workspaces")
      .update(updates)
      .eq("id", ctx.workspaceId)
      .select()
      .single();

    if (error) {
      console.error("Error updating workspace:", error);
      return NextResponse.json(
        { error: "Failed to update workspace" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Error in workspace API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
