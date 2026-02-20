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

    const { data: chats, error } = await supabase
      .from("chats")
      .select("id, title, user_id, created_at, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching chats:", error);
      return NextResponse.json(
        { error: "Failed to fetch chats" },
        { status: 500 }
      );
    }

    const chatIds = (chats || []).map((chat) => chat.id);
    const { data: messages } = chatIds.length
      ? await supabase
          .from("chat_messages")
          .select("chat_id, content, created_at")
          .in("chat_id", chatIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [] as Array<{ chat_id: string; content: string | null; created_at: string | null }> };

    const counts = new Map<string, number>();
    const previews = new Map<string, { content: string | null; createdAt: string | null }>();
    for (const message of messages || []) {
      counts.set(message.chat_id, (counts.get(message.chat_id) || 0) + 1);
      if (!previews.has(message.chat_id)) {
        previews.set(message.chat_id, {
          content: message.content,
          createdAt: message.created_at,
        });
      }
    }

    return NextResponse.json({
      chats: (chats || []).map((chat) => {
        const preview = previews.get(chat.id);
        return {
          id: chat.id,
          title: chat.title || "New Chat",
          created_by: chat.user_id,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          message_count: counts.get(chat.id) || 0,
          last_message_preview: preview?.content || "",
          last_message_at: preview?.createdAt,
        };
      }),
    });
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
