"use client";

import { MessageContent } from "./MessageContent";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Loader2 } from "lucide-react";
import type { Message } from "../hooks/useChat";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar className={isUser ? "bg-primary" : "bg-muted"}>
        <AvatarFallback>
          {isUser ? (
            <User className="h-5 w-5" />
          ) : (
            <Bot className="h-5 w-5" />
          )}
        </AvatarFallback>
      </Avatar>

      <div
        className={`flex-1 max-w-[85%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground ml-auto"
              : "bg-muted"
          }`}
        >
          {message.isStreaming && !message.content ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>

        {/* Tool calls indicator */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.toolCalls.map((tool, idx) => (
              <span
                key={idx}
                className="text-xs text-muted-foreground bg-muted-foreground/10 px-2 py-1 rounded-full"
              >
                🔧 {tool.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
