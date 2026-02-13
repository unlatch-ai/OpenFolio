"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatInterface } from "./components/ChatInterface";
import { PlanDebugTools } from "./components/PlanDebugTools";
import { SelectionPanel, SelectionSidebar } from "./components/SelectionSidebar";
import { PlanSelectionProvider, usePlanSelection } from "./components/PlanSelectionContext";
import { useChat } from "./hooks/useChat";
import { useChats } from "./hooks/useChats";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PanelLeftOpen } from "lucide-react";

function PlanPageBody({
  isContextOpen,
  setIsContextOpen,
}: {
  isContextOpen: boolean;
  setIsContextOpen: (open: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const chatIdParam = searchParams.get("chat");

  const selectedChatId = chatIdParam || undefined;

  const {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    currentChatId,
    sendMessage,
    stop,
    loadMessages,
  } = useChat(selectedChatId);

  const activeChatId = selectedChatId || currentChatId;

  const {
    chats,
    isLoading: isLoadingChats,
    deleteChat,
    refreshChats,
  } = useChats();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarVisible = isSidebarOpen && chats.length > 0;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Handle chat selection
  const handleSelectChat = (chatId: string) => {
    setIsHistoryOpen(false);
    router.push(`/app/plan?chat=${chatId}`);
  };

  // Handle new chat
  const handleNewChat = async () => {
    setIsHistoryOpen(false);
    router.push("/app/plan");
  };

  // Handle delete chat
  const handleDeleteChat = async (chatId: string) => {
    const success = await deleteChat(chatId);
    if (success && chatId === activeChatId) {
      router.push("/app/plan");
    }
  };

  const selection = usePlanSelection();

  const selectedContext = useMemo(() => {
    const items = selection?.pinnedItems ? [...selection.pinnedItems] : [];
    if (selection?.selectedItem) {
      items.unshift(selection.selectedItem);
    }
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selection]);

  // Send message handler
  const handleSendMessage = () => {
    if (!input.trim()) return;
    sendMessage(input, {
      selectedContext: selectedContext.map((item) => ({
        type: item.type,
        id: item.id,
      })),
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <PlanDebugTools />
      {/* Sidebar */}
      {sidebarVisible && (
        <div className="w-64 shrink-0 hidden md:block">
          <ChatSidebar
            chats={chats}
            currentChatId={activeChatId}
            isLoading={isLoadingChats}
            onNewChat={handleNewChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={handleDeleteChat}
            onRefresh={refreshChats}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <div className="md:hidden px-4 pt-4 pb-2 flex items-center gap-2">
          <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <PanelLeftOpen className="h-4 w-4" />
                History
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <ChatSidebar
                chats={chats}
                currentChatId={activeChatId}
                isLoading={isLoadingChats}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                onDeleteChat={handleDeleteChat}
                onRefresh={refreshChats}
              />
            </SheetContent>
          </Sheet>

          <Sheet open={isContextOpen} onOpenChange={setIsContextOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Context
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-80 max-w-full">
              <SelectionPanel />
            </SheetContent>
          </Sheet>
        </div>
        <ChatInterface
          messages={messages}
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onStop={stop}
          onRefreshMessages={() => {
            if (activeChatId) {
              loadMessages(activeChatId);
            }
          }}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
      </div>

      <SelectionSidebar />
    </div>
  );
}

// Inner component that uses search params
function PlanPageContent() {
  const [isContextOpen, setIsContextOpen] = useState(false);

  const handleSelectItem = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    setIsContextOpen(true);
  }, []);

  return (
    <PlanSelectionProvider onSelectItem={handleSelectItem}>
      <PlanPageBody
        isContextOpen={isContextOpen}
        setIsContextOpen={setIsContextOpen}
      />
    </PlanSelectionProvider>
  );
}

// Main page with suspense boundary
export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="animate-pulse text-muted-foreground">
            Loading...
          </div>
        </div>
      }
    >
      <PlanPageContent />
    </Suspense>
  );
}
