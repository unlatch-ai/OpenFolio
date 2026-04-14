import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../store";
import { Button } from "./ui/button";
import { ContactAvatar } from "./ContactAvatar";
import { toast } from "sonner";
import type { MessageDetail, ThreadDetail } from "@openfolio/shared-types";

/* ─── Thread list item ─── */
function ThreadRow({
  thread,
  isActive,
  onSelect,
}: {
  thread: { threadId: string; title: string; participantHandles: string[]; lastMessagePreview: string | null; lastMessageAt: number | null };
  isActive: boolean;
  onSelect: () => void;
}) {
  const timeLabel = thread.lastMessageAt
    ? new Date(thread.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  return (
    <button
      className={`thread-row ${isActive ? "active" : ""}`}
      onClick={onSelect}
    >
      <ContactAvatar
        name={thread.title}
        size={36}
        isGroup={thread.participantHandles.length > 1}
      />

      <div className="thread-row-content">
        <div className="thread-row-header">
          <span className="thread-row-name">{thread.title}</span>
          <span className="thread-row-time">{timeLabel}</span>
        </div>
        {thread.lastMessagePreview && (
          <p className="thread-row-preview">{thread.lastMessagePreview}</p>
        )}
      </div>
    </button>
  );
}

/* ─── Thread detail panel ─── */
function ThreadPanel({ threadId }: { threadId: string }) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.openfolio.threads.getDetail(threadId),
      window.openfolio.threads.getMessages({ threadId, limit: 100 }),
    ])
      .then(([d, m]) => {
        setDetail(d);
        setMessages(m);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [threadId]);

  if (loading) {
    return (
      <div className="thread-panel-loading">
        <div className="thread-panel-loading-dot" />
        <span>Loading conversation...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="thread-panel-empty">
        <p>Thread not found.</p>
      </div>
    );
  }

  return (
    <div className="thread-panel">
      {/* Header */}
      <div className="thread-panel-header">
        <div>
          <h2 className="thread-panel-title">
            {detail.thread.displayName || "Conversation"}
          </h2>
          <p className="thread-panel-meta">
            {detail.participants.map((p) => p.displayName || p.handle).join(", ")}
            {" \u00b7 "}
            {detail.totalMessageCount} messages
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="thread-panel-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`thread-msg ${msg.isFromMe ? "from-me" : "from-them"}`}
          >
            {!msg.isFromMe && (
              <ContactAvatar
                name={detail.participants.find((p) => p.personId === msg.personId)?.displayName ?? "?"}
                size={28}
              />
            )}
            <div className="thread-msg-bubble">
              {msg.body || <span className="text-muted-foreground italic text-xs">attachment</span>}
            </div>
            <span className="thread-msg-time">
              {new Date(msg.occurredAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyInbox() {
  const { messagesStatus, setBusy, setThreads, setMessagesStatus } = useAppStore();
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setBusy(true);
    try {
      const job = await window.openfolio.messages.startImport();
      if (job.status === "completed") {
        toast.success(`Imported ${job.importedMessages} messages across ${job.importedThreads} threads`);
        const threads = await window.openfolio.threads.list({ limit: 50 });
        setThreads(threads);
      } else {
        toast.error(job.error || "Import failed.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
      setBusy(false);
    }
  }, [setBusy, setThreads]);

  const handleRequestAccess = useCallback(async () => {
    try {
      const status = await window.openfolio.messages.requestAccess();
      setMessagesStatus(status);
      if (status.status === "granted") {
        toast.success("Messages access granted!");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to check access.");
    }
  }, [setMessagesStatus]);

  return (
    <div className="inbox-empty">
      <div className="inbox-empty-card">
        <div className="inbox-empty-icon">
          <MessageSquare size={32} />
        </div>
        <h2>Your conversations</h2>
        <p>
          Import your iMessage history to see your conversations here.
          Everything stays on this Mac — nothing leaves your device.
        </p>
        <div className="inbox-empty-actions">
          {messagesStatus?.status !== "granted" ? (
            <Button onClick={handleRequestAccess} variant="default" size="sm">
              Grant Messages Access
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={importing} size="sm">
              <RefreshCw size={14} className={importing ? "animate-spin" : ""} />
              Import Messages
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main inbox view ─── */
export function InboxView() {
  const { threads, selectedThreadId, selectThread } = useAppStore();
  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation: arrow keys to move, Escape to deselect
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't capture if command palette is open or focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useAppStore.getState().commandPalette.open) return;

      if (e.key === "Escape" && selectedThreadId) {
        selectThread(null);
        return;
      }

      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && threads.length > 0) {
        e.preventDefault();
        const currentIndex = selectedThreadId
          ? threads.findIndex((t) => t.threadId === selectedThreadId)
          : -1;

        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < threads.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : threads.length - 1;
        }

        selectThread(threads[nextIndex].threadId);

        // Scroll into view
        const row = listRef.current?.children[nextIndex] as HTMLElement | undefined;
        row?.scrollIntoView({ block: "nearest" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threads, selectedThreadId, selectThread]);

  if (threads.length === 0) {
    return <EmptyInbox />;
  }

  return (
    <div className="inbox-layout">
      {/* Thread list */}
      <div className="inbox-list">
        <div className="inbox-list-header">
          <h2>Messages</h2>
          <span className="inbox-list-count">{threads.length}</span>
        </div>
        <div className="inbox-list-scroll" ref={listRef}>
          {threads.map((thread) => (
            <ThreadRow
              key={thread.threadId}
              thread={thread}
              isActive={selectedThreadId === thread.threadId}
              onSelect={() => selectThread(thread.threadId)}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="inbox-detail">
        <AnimatePresence mode="wait">
          {selectedThreadId ? (
            <motion.div
              key={selectedThreadId}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="inbox-detail-inner"
            >
              <ThreadPanel threadId={selectedThreadId} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inbox-detail-empty"
            >
              <MessageSquare size={24} className="text-muted-foreground/40" />
              <p>Select a conversation</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
