"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    type: "event" | "contact" | "partner";
    id: string;
    name: string;
  }>;
  toolCalls?: Array<{
    name: string;
    arguments: unknown;
  }>;
  isStreaming?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  created_by: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string;
  last_message_at?: string;
};

export type SelectedContextItem = {
  type: "event" | "contact" | "partner";
  id: string;
};

export function useChat(chatId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipNextLoadRef = useRef<string | null>(null);
  const pendingSyncRef = useRef(false);
  const pendingSyncChatIdRef = useRef<string | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChatIdRef = useRef<string | undefined>(chatId);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/chats/${id}/messages`);
      if (!response.ok) throw new Error("Failed to load messages");
      
      const data = await response.json();
      setMessages(
        data.messages.map((m: {
          id: string;
          role: string;
          content: string;
          citations?: unknown;
          tool_calls?: unknown;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: m.citations,
          toolCalls: m.tool_calls,
        }))
      );
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }, []);

  // Load messages when chatId changes
  useEffect(() => {
    activeChatIdRef.current = chatId;
    if (chatId) {
      if (skipNextLoadRef.current === chatId) {
        skipNextLoadRef.current = null;
        setCurrentChatId(chatId);
        return;
      }
      loadMessages(chatId);
      setCurrentChatId(chatId);
    } else {
      setMessages([]);
      setCurrentChatId(undefined);
    }
  }, [chatId, loadMessages]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: { selectedContext?: SelectedContextItem[] }
    ) => {
      if (!content.trim() || isLoading) return;

      // Add user message immediately
      const userMessage: Message = {
        role: "user",
        content: content.trim(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);
      setIsStreaming(true);

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            chatId: currentChatId,
            selectedContext: options?.selectedContext?.slice(0, 10) ?? [],
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        // Get the chat ID from headers
        const newChatId = response.headers.get("X-Chat-Id");
        const isNewChat = response.headers.get("X-New-Chat") === "true";
        
        if (newChatId && isNewChat) {
          setCurrentChatId(newChatId);
          skipNextLoadRef.current = newChatId;
          pendingSyncRef.current = true;
          pendingSyncChatIdRef.current = newChatId;
          // Update URL without navigation
          window.history.replaceState({}, "", `/app/plan?chat=${newChatId}`);
        }

        // Handle streaming response (UI message SSE)
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let buffer = "";

        const updateAssistant = (content: string) => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            const lastMessage = newMessages[lastIndex];
            if (lastMessage.role === "assistant") {
              newMessages[lastIndex] = {
                ...lastMessage,
                content,
              };
            } else {
              newMessages.push({
                role: "assistant",
                content,
                isStreaming: true,
              });
            }
            return newMessages;
          });
        };

        const handleData = (data: string) => {
          const trimmed = data.trim();
          if (!trimmed || trimmed === "[DONE]") return;
          let parsed: { type?: string; delta?: string; text?: string } | null = null;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            return;
          }
          if (!parsed) return;
          if (parsed.type === "text-delta" && parsed.delta) {
            assistantContent += parsed.delta;
            updateAssistant(assistantContent);
          } else if (parsed.type === "text" && parsed.text) {
            assistantContent += parsed.text;
            updateAssistant(assistantContent);
          }
        };

        const handleEvent = (rawEvent: string) => {
          const lines = rawEvent.split("\n");
          const dataLines: string[] = [];
          for (const line of lines) {
            const cleaned = line.replace(/\r$/, "");
            if (cleaned.startsWith("data:")) {
              dataLines.push(cleaned.slice(5).trimStart());
            }
          }
          if (dataLines.length === 0) return;
          handleData(dataLines.join("\n"));
        };

        if (reader) {
          // Add placeholder for assistant message
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", isStreaming: true },
          ]);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");

            let boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex !== -1) {
              const eventBlock = buffer.slice(0, boundaryIndex);
              buffer = buffer.slice(boundaryIndex + 2);
              handleEvent(eventBlock);
              boundaryIndex = buffer.indexOf("\n\n");
            }
          }

          if (buffer.trim()) {
            handleEvent(buffer);
          }

          // Mark streaming as complete
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            const lastMessage = newMessages[lastIndex];
            if (lastMessage.role === "assistant") {
              newMessages[lastIndex] = {
                ...lastMessage,
                isStreaming: false,
              };
            }
            return newMessages;
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Request aborted");
        } else {
          console.error("Error sending message:", error);
          // Add error message
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;

        if (pendingSyncRef.current) {
          const syncChatId = pendingSyncChatIdRef.current ?? currentChatId;
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
          }
          syncTimeoutRef.current = setTimeout(() => {
            if (
              syncChatId &&
              activeChatIdRef.current === syncChatId
            ) {
              loadMessages(syncChatId);
            }
            pendingSyncRef.current = false;
            pendingSyncChatIdRef.current = null;
            syncTimeoutRef.current = null;
          }, 400);
        }
      }
    },
    [currentChatId, isLoading, loadMessages]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentChatId(undefined);
    window.history.replaceState({}, "", "/app/plan");
  }, []);

  return {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    currentChatId,
    sendMessage,
    stop,
    clearMessages,
    loadMessages,
  };
}
