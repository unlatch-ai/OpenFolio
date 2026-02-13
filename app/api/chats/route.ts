/**
 * Chat Sessions API
 * 
 * GET /api/chats - List chat sessions for the org
 * POST /api/chats - Create a new chat session
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

// GET /api/chats - List chat sessions
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // Use the helper function to get chats with message counts
    const { data: chats, error } = await supabase.rpc("get_org_chats", {
      p_workspace_id: ctx.workspaceId,
      p_limit: 50,
    });

    if (error) {
      console.error("Error fetching chats:", error);
      return NextResponse.json(
        { error: "Failed to fetch chats" },
        { status: 500 }
      );
    }

    return NextResponse.json({ chats: chats || [] });
  } catch (error) {
    console.error("Error in GET /api/chats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/chats - Create a new chat session
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const { title = "New Chat" } = body;

    const supabase = await createClient();

    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        workspace_id: ctx.workspaceId,
        title: title.substring(0, 100),
        user_id: ctx.user.id,
      })
      .select()
      .single();

    if (error || !chat) {
      console.error("Error creating chat:", error);
      return NextResponse.json(
        { error: "Failed to create chat" },
        { status: 500 }
      );
    }

    return NextResponse.json({ chat }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/chats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
