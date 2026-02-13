"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatSession } from "./useChat";

export function useChats() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch("/api/chats");
      if (!response.ok) throw new Error("Failed to load chats");
      
      const data = await response.json();
      setChats(data.chats || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading chats:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const createChat = useCallback(async (title?: string) => {
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "New Chat" }),
      });

      if (!response.ok) throw new Error("Failed to create chat");

      const data = await response.json();
      setChats((prev) => [data.chat, ...prev]);
      return data.chat as ChatSession;
    } catch (err) {
      console.error("Error creating chat:", err);
      return null;
    }
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete chat");

      setChats((prev) => prev.filter((c) => c.id !== chatId));
      return true;
    } catch (err) {
      console.error("Error deleting chat:", err);
      return false;
    }
  }, []);

  const refreshChats = useCallback(() => {
    return loadChats();
  }, [loadChats]);

  return {
    chats,
    isLoading,
    error,
    createChat,
    deleteChat,
    refreshChats,
  };
}
