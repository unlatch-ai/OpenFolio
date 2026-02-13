"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MessageSquare,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "@/lib/utils";
import type { ChatSession } from "../hooks/useChat";

interface ChatSidebarProps {
  chats: ChatSession[];
  currentChatId?: string;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRefresh: () => void;
}

export function ChatSidebar({
  chats,
  currentChatId,
  isLoading,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRefresh,
}: ChatSidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(chatId);
    await onDeleteChat(chatId);
    setDeletingId(null);
  };

  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b">
        <Button onClick={onNewChat} className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Refresh button */}
      <div className="px-4 py-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="w-full gap-2 text-muted-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1">
        <div className="p-2 pr-4 space-y-1">
          {chats.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No chats yet
            </div>
          )}

          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full text-left p-3 pr-10 rounded-lg transition-colors group relative overflow-hidden ${
                currentChatId === chat.id
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted border border-transparent"
              }`}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {chat.title || "Untitled Chat"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {chat.last_message_at
                      ? formatDistanceToNow(new Date(chat.last_message_at))
                      : formatDistanceToNow(new Date(chat.created_at))}
                  </p>
                  {chat.message_count > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {chat.message_count} messages
                    </p>
                  )}
                </div>
              </div>

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 h-6 w-6"
                onClick={(e) => handleDelete(chat.id, e)}
                disabled={deletingId === chat.id}
              >
                {deletingId === chat.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
