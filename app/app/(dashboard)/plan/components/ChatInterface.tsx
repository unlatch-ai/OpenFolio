"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import type { Message } from "../hooks/useChat";

interface ChatInterfaceProps {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: () => void;
  onStop: () => void;
  chatUpdatedAt?: string;
  onRefreshMessages?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function ChatInterface({
  messages,
  input,
  setInput,
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  chatUpdatedAt,
  onRefreshMessages,
  isSidebarOpen,
  onToggleSidebar,
}: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  // Track whether user is near the bottom to avoid fighting manual scroll.
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    const viewport = scrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;
    viewportRef.current = viewport;

    if (!viewport) {
      return;
    }

    const updateIsAtBottom = () => {
      const threshold = 80;
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isAtBottomRef.current = distanceFromBottom <= threshold;
    };

    updateIsAtBottom();
    viewport.addEventListener("scroll", updateIsAtBottom, { passive: true });
    return () => viewport.removeEventListener("scroll", updateIsAtBottom);
  }, []);

  // Auto-scroll to bottom when new messages arrive (only if already at bottom).
  useEffect(() => {
    if (!isAtBottomRef.current) {
      return;
    }

    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: isStreaming ? "auto" : "smooth",
      });
      return;
    }

    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
    }
  }, [messages, isStreaming]);

  // Check if chat has been updated by another user
  const showRefreshBanner = chatUpdatedAt && messages.length > 0 && onRefreshMessages;
  const showSidebarToggle = typeof onToggleSidebar === "function";
  const sidebarLabel = isSidebarOpen ? "Hide history" : "Show history";

  return (
    <div className="flex flex-col h-full">
      {showSidebarToggle && (
        <div className="px-4 pt-4 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="hidden md:inline-flex gap-2 text-muted-foreground"
            aria-label={sidebarLabel}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
            {sidebarLabel}
          </Button>
        </div>
      )}

      {/* Refresh banner for multi-user */}
      {showRefreshBanner && (
        <Alert className="m-4 mb-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>New messages may be available</span>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshMessages}
              className="gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Ask your AI assistant</p>
              <p className="text-sm mt-2">
                Ask me about your contacts, companies, or recent interactions
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                <ExamplePrompt
                  text="Who did I meet last week?"
                  onClick={() => setInput("Who did I meet last week?")}
                />
                <ExamplePrompt
                  text="Find contacts who work in AI"
                  onClick={() => setInput("Find contacts who work in AI")}
                />
                <ExamplePrompt
                  text="Summarize my relationship with Acme Corp"
                  onClick={() => setInput("Summarize my relationship with Acme Corp")}
                />
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                ref={index === messages.length - 1 ? lastMessageRef : undefined}
              >
                <MessageBubble message={message} />
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <MessageInput
        value={input}
        onChange={setInput}
        onSubmit={onSendMessage}
        isLoading={isLoading}
        isStreaming={isStreaming}
        onStop={onStop}
      />
    </div>
  );
}

function ExamplePrompt({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-sm px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-full transition-colors"
    >
      {text}
    </button>
  );
}
