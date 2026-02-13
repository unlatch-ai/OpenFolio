/**
 * Chat Messages API
 * 
 * GET /api/chats/[id]/messages - Get messages for a chat
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";

// GET /api/chats/[id]/messages - Get chat messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const supabase = await createClient();

    // Verify user has access to this chat
    const { data: chat } = await supabase
      .from("chats")
      .select("id, updated_at")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 }
      );
    }

    // Get messages with user info
    const { data: messages, error } = await supabase.rpc("get_chat_history", {
      p_chat_id: id,
      p_limit: 100,
    });

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      messages: messages || [],
      chat_updated_at: chat.updated_at,
    });
  } catch (error) {
    console.error("Error in GET /api/chats/[id]/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
