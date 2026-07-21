import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, File, Search } from "lucide-react";
import type {
  MessageDetail,
  ThreadDetail,
  ThreadListItem,
} from "@openfolio/shared-types";
import { useAppStore } from "../store";
import { ContactAvatar } from "./ContactAvatar";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

function exactDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function ConversationRow({
  thread,
  selected,
  onClick,
}: {
  thread: ThreadListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`archive-thread-row ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <ContactAvatar
        name={thread.title}
        isGroup={thread.participantCount > 1}
      />
      <span>
        <strong>{thread.title}</strong>
        <small>
          {thread.lastMessagePreview || thread.participantHandles.join(", ")}
        </small>
      </span>
      {thread.lastMessageAt && (
        <time dateTime={new Date(thread.lastMessageAt).toISOString()}>
          {new Date(thread.lastMessageAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </time>
      )}
    </button>
  );
}

function ConversationArchive({
  threadId,
  citationId,
  onBack,
}: {
  threadId: string;
  citationId: string | null;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSourceEducation, setShowSourceEducation] = useState(false);
  const citationRef = useRef<HTMLElement | null>(null);
  const pageSize = 75;

  useEffect(() => {
    if (!citationId || localStorage.getItem("openfolio.sourceEducationSeen") === "1") return;
    setShowSourceEducation(true);
    localStorage.setItem("openfolio.sourceEducationSeen", "1");
  }, [citationId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.openfolio.threads.getDetail(threadId),
      window.openfolio.threads.getMessages({
        threadId,
        limit: pageSize,
        offset: citationId ? 0 : offset,
        aroundMessageId: citationId,
      }),
    ])
      .then(([nextDetail, nextMessages]) => {
        setDetail(nextDetail);
        setMessages(nextMessages);
      })
      .finally(() => setLoading(false));
  }, [citationId, offset, threadId]);
  useEffect(() => {
    setOffset(0);
  }, [threadId, citationId]);
  useEffect(() => {
    if (!loading && citationId)
      citationRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [citationId, loading, messages]);

  if (loading)
    return (
      <div className="conversation-loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="message-skeleton" />
        ))}
      </div>
    );
  if (!detail)
    return (
      <div className="archive-empty">
        <h2>Conversation not found.</h2>
        <Button variant="secondary" onClick={onBack}>
          Back to conversations
        </Button>
      </div>
    );

  let previousDate = "";
  return (
    <article className="conversation-archive">
      <header className="conversation-header">
        <button
          className="mobile-back icon-button"
          onClick={onBack}
          aria-label="Back to conversation list"
        >
          <ArrowLeft />
        </button>
        <div>
          <p className="eyebrow">Original messages</p>
          <h1>{detail.thread.displayName || "Conversation"}</h1>
          <p>
            {detail.participants
              .map(
                (participant) => participant.displayName || participant.handle,
              )
              .join(", ")}{" "}
            · {detail.totalMessageCount.toLocaleString()} messages
          </p>
        </div>
        <div className="archive-paging">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
            disabled={offset === 0}
          >
            Newer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOffset(offset + pageSize)}
            disabled={offset + pageSize >= detail.totalMessageCount}
          >
            Older
          </Button>
        </div>
      </header>
      <div className="message-archive">
        {showSourceEducation && (
          <div className="source-education" role="status">
            <span>This is the original message. Search always brings you back to the source.</span>
            <button type="button" onClick={() => setShowSourceEducation(false)} aria-label="Dismiss source explanation">×</button>
          </div>
        )}
        {messages.map((message) => {
          const date = exactDate(message.occurredAt);
          const showDate = date !== previousDate;
          previousDate = date;
          const sender = message.isFromMe
            ? "You"
            : detail.participants.find(
                (participant) => participant.personId === message.personId,
              )?.displayName || "Participant";
          return (
            <div key={message.id} className="message-entry-wrap">
              {showDate && (
                <div className="date-rule">
                  <span>{date}</span>
                </div>
              )}
              <section
                ref={message.id === citationId ? citationRef : undefined}
                className={`archive-message ${message.isFromMe ? "outgoing" : "incoming"} ${message.id === citationId ? "citation" : ""}`}
                aria-current={message.id === citationId ? "true" : undefined}
              >
                {message.id === citationId && (
                  <span className="source-label">Source match</span>
                )}
                <span className="message-sender">{sender}</span>
                {message.body && <p>{message.body}</p>}
                {message.attachments.map((attachment) => (
                  <div className="attachment-row" key={attachment.id}>
                    <File />
                    <span>
                      <strong>Attachment</strong>
                      <small>{attachment.mimeType || "Attachment"}</small>
                    </span>
                  </div>
                ))}
                {!message.body && !message.attachments.length && (
                  <p>Message without text</p>
                )}
                <time dateTime={new Date(message.occurredAt).toISOString()}>
                  {new Date(message.occurredAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </section>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function InboxView() {
  const { threads, selectedThreadId, selectedMessageId, selectThread } =
    useAppStore();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      threads.filter((thread) =>
        `${thread.title} ${thread.participantHandles.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, threads],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Escape" && selectedThreadId) selectThread(null);
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        filtered.length
      ) {
        event.preventDefault();
        const current = filtered.findIndex(
          (thread) => thread.threadId === selectedThreadId,
        );
        const next =
          event.key === "ArrowDown"
            ? (current + 1) % filtered.length
            : current <= 0
              ? filtered.length - 1
              : current - 1;
        selectThread(filtered[next].threadId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectThread, selectedThreadId]);

  return (
    <main
      className={`conversations-view ${selectedThreadId ? "has-selection" : ""}`}
    >
      <aside className="conversation-index">
        <header>
          <p className="eyebrow">Original records</p>
          <h1>Conversations</h1>
          <label className="compact-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </label>
        </header>
        <div className="conversation-list">
          {filtered.map((thread) => (
            <ConversationRow
              key={thread.threadId}
              thread={thread}
              selected={selectedThreadId === thread.threadId}
              onClick={() => selectThread(thread.threadId)}
            />
          ))}
          {!filtered.length && (
            <p className="list-empty">No conversations found.</p>
          )}
        </div>
      </aside>
      <section className="conversation-reader">
        {selectedThreadId ? (
          <ConversationArchive
            threadId={selectedThreadId}
            citationId={selectedMessageId}
            onBack={() => selectThread(null)}
          />
        ) : (
          <div className="archive-empty">
            <Archive />
            <h2>Select a conversation</h2>
            <p>
              Read the original messages. OpenFolio is read-only and cannot send
              anything.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Archive(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M4 7h16v13H4zM3 3h18v4H3zm5 8h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
