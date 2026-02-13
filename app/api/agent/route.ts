/**
 * AI Agent Streaming Endpoint
 *
 * POST /api/agent
 * Body: { message: string, chatId?: string }
 * Response: Streaming text with tool calls
 */

import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceContextError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { openfolioTools, type ToolContext } from "@/lib/ai/tools";
import {
  OPENFOLIO_SYSTEM_PROMPT,
  CHAT_TITLE_GENERATION_PROMPT,
} from "@/lib/ai/prompts";
import { generateText } from "ai";
import { z } from "zod";
import {
  getTracer,
  createAgentExample,
  evaluateWithBuiltIn,
  evaluateTrace,
} from "@/lib/judgeval";

const requestSchema = z.object({
  message: z.string().min(1).max(10000),
  chatId: z.string().uuid().optional(),
  selectedContext: z
    .array(
      z.object({
        type: z.enum(["person", "company", "interaction"]),
        id: z.string().uuid(),
      })
    )
    .max(10)
    .optional(),
});

async function generateChatTitle(message: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: openai("gpt-5-mini-2025-08-07"),
      prompt: `${CHAT_TITLE_GENERATION_PROMPT}\n\nUser message: "${message.substring(0, 200)}"`,
      temperature: 0.7,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "generate-chat-title",
      },
    });
    return text.trim().substring(0, 100) || "New Chat";
  } catch {
    return message.split(" ").slice(0, 5).join(" ").substring(0, 50) || "New Chat";
  }
}

// Simple message type that matches what we store
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  // Initialize tracer for telemetry and behavior monitoring.
  let tracer: Awaited<ReturnType<typeof getTracer>> | null = null;
  try {
    tracer = await getTracer();
  } catch (err) {
    console.error("Failed to initialize Judgeval tracer:", err);
  }

  try {
    const ctx = await getWorkspaceContext(request);
    if (isWorkspaceContextError(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const limitResult = rateLimit(request, {
      key: "agent:chat",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { message, chatId } = validation.data;
    const supabase = await createClient();

    let sessionId = chatId;
    let isNewChat = false;

    if (!sessionId) {
      isNewChat = true;
      const title = await generateChatTitle(message);

      const { data: session, error: sessionError } = await supabase
        .from("chats")
        .insert({
          workspace_id: ctx.workspaceId,
          title,
          user_id: ctx.user.id,
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: "Failed to create chat session" },
          { status: 500 }
        );
      }

      sessionId = session.id;
    } else {
      const { data: session } = await supabase
        .from("chats")
        .select("id")
        .eq("id", sessionId)
        .eq("workspace_id", ctx.workspaceId)
        .single();

      if (!session) {
        return NextResponse.json(
          { error: "Chat not found or access denied" },
          { status: 404 }
        );
      }
    }

    const { error: messageError } = await supabase.from("chat_messages").insert({
      chat_id: sessionId,
      user_id: ctx.user.id,
      workspace_id: ctx.workspaceId,
      role: "user",
      content: message,
    });

    if (messageError) {
      return NextResponse.json(
        { error: "Failed to save message" },
        { status: 500 }
      );
    }

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages: ChatMessage[] = (history || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    messages.push({
      role: "user",
      content: message,
    });

    const { data: workspaceData } = await supabase
      .from("workspaces")
      .select("settings")
      .eq("id", ctx.workspaceId)
      .single();

    let customInstructions: string | null = null;
    if (
      workspaceData?.settings &&
      typeof workspaceData.settings === "object" &&
      !Array.isArray(workspaceData.settings)
    ) {
      const value = (workspaceData.settings as Record<string, unknown>)
        .custom_instructions;
      if (typeof value === "string" && value.trim().length > 0) {
        customInstructions = value;
      }
    }

    const systemPrompt = customInstructions
      ? `${OPENFOLIO_SYSTEM_PROMPT}\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}`
      : OPENFOLIO_SYSTEM_PROMPT;

    // Create tool context
    const toolContext: ToolContext = { workspaceId: ctx.workspaceId, userId: ctx.user.id };

    // Core agent logic
    async function runAgent(): Promise<Response> {
      if (tracer) {
        evaluateTrace(tracer, "OpenFolio Trace Helpfulness");
      }

      const result = streamText({
        model: openai("gpt-5.2-2025-12-11"),
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        tools: openfolioTools,
        experimental_context: toolContext,
        stopWhen: stepCountIs(10),
        temperature: 0.7,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "openfolio-agent",
          metadata: {
            chatId: sessionId,
            workspaceId: ctx.workspaceId,
            userId: ctx.user.id,
          },
        },
        onFinish: async ({ text, toolCalls }) => {
          try {
            await supabase.from("chat_messages").insert({
              chat_id: sessionId,
              user_id: ctx.user.id,
              workspace_id: ctx.workspaceId,
              role: "assistant",
              content: text,
              tool_calls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls.map((tc) => ({
                name: tc.toolName,
                arguments: tc.input,
              })))) : null,
            });

            // Async behavior evaluation (non-blocking)
            if (tracer) {
              const example = createAgentExample({
                userMessage: message,
                agentResponse: text,
                toolsCalled: toolCalls.map((tc) => tc.toolName),
              });
              evaluateWithBuiltIn(tracer, example);
            }
          } catch (err) {
            console.error("Error saving assistant message:", err);
          }
        },
      });

      const response = result.toUIMessageStreamResponse();
      response.headers.set("X-Chat-Id", sessionId!);

      if (isNewChat) {
        response.headers.set("X-New-Chat", "true");
      }

      return response;
    }

    if (tracer) {
      const observedAgent = tracer.observe(runAgent, "function");
      return observedAgent();
    }

    return runAgent();
  } catch (error) {
    console.error("Error in agent endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
