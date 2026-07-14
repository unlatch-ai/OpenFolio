import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  MessageSquare,
  Search,
  User,
  X,
} from "lucide-react";
import type {
  MessageDetail,
  Person,
  SearchResult,
} from "@openfolio/shared-types";
import { useAppStore } from "../store";
import {
  formatCitationMeta,
  formatMatchReason,
  highlightSnippet,
  queryEditorialArchive,
} from "../search-results";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { FolioMark } from "./FolioMark";

const EXAMPLES = [
  "the ramen place Jordan recommended",
  "who told me about the red-eye to Tokyo",
  "messages about the lease renewal",
];

function ResultIcon({ kind }: { kind: SearchResult["kind"] }) {
  if (kind === "person") return <User aria-hidden="true" />;
  if (kind === "thread") return <Archive aria-hidden="true" />;
  return <MessageSquare aria-hidden="true" />;
}

function EvidencePreview({
  result,
  onOpen,
  onClose,
}: {
  result: SearchResult;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [context, setContext] = useState<MessageDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!result.threadId || !result.messageId) {
      setContext([]);
      return;
    }
    setLoading(true);
    window.openfolio.search
      .getCitationContext({
        threadId: result.threadId,
        messageId: result.messageId,
        before: 3,
        after: 3,
      })
      .then((citation) => setContext(citation.messages))
      .catch(() => setContext([]))
      .finally(() => setLoading(false));
  }, [result.threadId, result.messageId]);

  return (
    <aside className="evidence-preview" aria-label="Source evidence">
      <header>
        <div>
          <FolioMark number="01A" label="SOURCE LEAF" />
          <p className="eyebrow">Evidence</p>
          <h2>{result.title}</h2>
          <p>{formatCitationMeta(result)}</p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close evidence preview"
        >
          <X />
        </button>
      </header>
      <div className="evidence-context">
        {loading &&
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="evidence-skeleton" />
          ))}
        {!loading && context.length === 0 && (
          <p className="evidence-snippet">{result.snippet}</p>
        )}
        {!loading &&
          context.map((message) => (
            <div
              key={message.id}
              className={`evidence-message ${message.id === result.messageId ? "source" : ""}`}
              aria-current={
                message.id === result.messageId ? "true" : undefined
              }
            >
              {message.id === result.messageId && (
                <span className="source-label">Source match</span>
              )}
              <span>
                {message.isFromMe
                  ? "You"
                  : result.senderLabel ||
                    result.citation.personLabel ||
                    result.title}
              </span>
              <p>
                {message.body ||
                  (message.hasAttachments
                    ? "Attachment"
                    : "Message without text")}
              </p>
              <time dateTime={new Date(message.occurredAt).toISOString()}>
                {new Date(message.occurredAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
      </div>
      <Button onClick={onOpen}>
        {result.kind === "person"
          ? "Open person dossier"
          : result.kind === "thread"
            ? "Open conversation"
            : "Open in conversation"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </aside>
  );
}

export function SearchView() {
  const {
    search,
    threads,
    embeddingSync,
    setSearchQuery,
    setSearchResults,
    setSearching,
    setSearchError,
    selectSearchResult,
    setSearchFilters,
    clearSearchFilters,
    setView,
    selectThread,
    selectMessage,
    selectPerson,
  } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const selected = search.results.find(
    (result) => result.id === search.selectedResultId,
  );

  useEffect(() => {
    window.openfolio.people
      .list({ limit: 100 })
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [search.focusRequest]);

  const runSearch = useCallback(
    async (query: string) => {
      const text = query.trim();
      if (!text) {
        setSearchResults([]);
        setSearching(false);
        setSearchError(null);
        return;
      }
      const id = ++requestRef.current;
      setSearching(true);
      setSearchError(null);
      try {
        const results = await queryEditorialArchive({
          text,
          filters: search.filters,
          limit: 50,
        });
        if (id === requestRef.current) setSearchResults(results);
      } catch {
        if (id === requestRef.current)
          setSearchError("Search could not read the local index. Try again.");
      } finally {
        if (id === requestRef.current) setSearching(false);
      }
    },
    [search.filters, setSearchError, setSearchResults, setSearching],
  );

  useEffect(() => {
    if (!search.query.trim()) return;
    const timeout = window.setTimeout(() => void runSearch(search.query), 180);
    return () => window.clearTimeout(timeout);
  }, [search.query, search.filters, runSearch]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useAppStore.getState().navigateToSearch();
      } else if (
        event.key === "Escape" &&
        useAppStore.getState().view === "search"
      ) {
        const current = useAppStore.getState().search;
        if (current.selectedResultId) selectSearchResult(null);
        else if (current.query) setSearchQuery("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectSearchResult, setSearchQuery]);

  const openResult = (result: SearchResult) => {
    if (result.kind === "person" && (result.personId || result.entityId)) {
      selectPerson(result.personId || result.entityId);
      setView("people");
      return;
    }
    const threadId =
      result.threadId || (result.kind === "thread" ? result.entityId : null);
    if (threadId) {
      selectThread(threadId);
      selectMessage(result.messageId ?? null);
      setView("conversations");
    }
  };

  const applied = useMemo(
    () =>
      [
        search.filters.type !== "all"
          ? { key: "type", label: `Type: ${search.filters.type}` }
          : null,
        search.filters.personId
          ? {
              key: "personId",
              label:
                people.find((person) => person.id === search.filters.personId)
                  ?.displayName || "Person",
            }
          : null,
        search.filters.threadId
          ? {
              key: "threadId",
              label:
                threads.find(
                  (thread) => thread.threadId === search.filters.threadId,
                )?.title || "Conversation",
            }
          : null,
        search.filters.date !== "any"
          ? {
              key: "date",
              label:
                search.filters.date === "this-year" ? "This year" : "Last year",
            }
          : null,
      ].filter(Boolean) as Array<{
        key: "type" | "personId" | "threadId" | "date";
        label: string;
      }>,
    [people, search.filters, threads],
  );

  const partial = Boolean(
    embeddingSync &&
      (embeddingSync.dirtyDocuments > 0 || embeddingSync.syncing),
  );
  const pristine = !search.query.trim();

  return (
    <main className={`search-view ${selected ? "has-evidence" : ""}`}>
      <section className="search-main">
        <div className={`search-opening ${pristine ? "pristine" : ""}`}>
          <FolioMark number="01" label="RECALL INDEX" />
          <p className="eyebrow">Private iMessage search</p>
          <h1>
            {pristine ? "OpenFolio remembers who told you what." : "Search"}
          </h1>
          <form
            className="archive-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(search.query);
            }}
            role="search"
          >
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              value={search.query}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search your iMessage history…"
              aria-label="Search your iMessage history"
            />
            {search.query ? (
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                aria-label="Clear search"
              >
                <X />
              </button>
            ) : (
              <kbd>⌘K</kbd>
            )}
            {search.searching && (
              <span className="spinner" aria-label="Searching" />
            )}
          </form>
        </div>

        {pristine ? (
          <div className="search-pristine">
            <p>Try something you remember clearly.</p>
            <div className="example-queries">
              {EXAMPLES.map((example) => (
                <button key={example} onClick={() => setSearchQuery(example)}>
                  {example}
                  <ArrowRight />
                </button>
              ))}
            </div>
            <p className="privacy-line">
              Your messages and search index stay on this Mac.
            </p>
          </div>
        ) : (
          <>
            <div className="filter-bar" aria-label="Search filters">
              <label>
                Type
                <select
                  value={search.filters.type}
                  onChange={(event) =>
                    setSearchFilters({
                      type: event.target.value as typeof search.filters.type,
                    })
                  }
                >
                  <option value="all">All</option>
                  <option value="messages">Messages</option>
                  <option value="people">People</option>
                  <option value="conversations">Conversations</option>
                </select>
              </label>
              <label>
                Person
                <select
                  value={search.filters.personId ?? ""}
                  onChange={(event) =>
                    setSearchFilters({ personId: event.target.value || null })
                  }
                >
                  <option value="">Anyone</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName ||
                        person.primaryHandle ||
                        "Unknown contact"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conversation
                <select
                  value={search.filters.threadId ?? ""}
                  onChange={(event) =>
                    setSearchFilters({ threadId: event.target.value || null })
                  }
                >
                  <option value="">Any conversation</option>
                  {threads.map((thread) => (
                    <option key={thread.threadId} value={thread.threadId}>
                      {thread.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <select
                  value={search.filters.date}
                  onChange={(event) =>
                    setSearchFilters({
                      date: event.target.value as typeof search.filters.date,
                    })
                  }
                >
                  <option value="any">Any time</option>
                  <option value="this-year">This year</option>
                  <option value="last-year">Last year</option>
                </select>
              </label>
            </div>
            {applied.length > 0 && (
              <div className="filter-chips">
                {applied.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() =>
                      setSearchFilters({
                        [filter.key]:
                          filter.key === "type"
                            ? "all"
                            : filter.key === "date"
                              ? "any"
                              : null,
                      })
                    }
                  >
                    {filter.label}
                    <X />
                  </button>
                ))}
                <button onClick={clearSearchFilters}>Clear all</button>
              </div>
            )}
            {partial && (
              <div className="archive-alert" role="status">
                <span>Search is ready.</span> Meaning-based matches will improve
                as indexing finishes.
              </div>
            )}
            <div className="result-status" aria-live="polite">
              <strong>
                {search.results.length}{" "}
                {search.results.length === 1 ? "match" : "matches"}
              </strong>
              <span>
                {search.searching
                  ? "Searching…"
                  : embeddingSync?.lastError
                    ? "Exact search ready · semantic unavailable"
                    : "Local retrieval"}
              </span>
            </div>
            {search.error && (
              <div className="archive-error" role="alert">
                <p>{search.error}</p>
                <Button
                  variant="secondary"
                  onClick={() => void runSearch(search.query)}
                >
                  Try again
                </Button>
              </div>
            )}
            {!search.error &&
              !search.searching &&
              search.results.length === 0 && (
                <div className="archive-empty">
                  <MessageSquare />
                  <h2>No messages matched that memory.</h2>
                  <p>Try exact words, a name, or remove one of the filters.</p>
                  {applied.length > 0 && (
                    <Button variant="secondary" onClick={clearSearchFilters}>
                      Remove filters
                    </Button>
                  )}
                </div>
              )}
            <div
              className={`search-results ${search.searching ? "is-searching" : ""}`}
              aria-busy={search.searching}
            >
              {search.results.map((result) => {
                return (
                  <button
                    key={result.id}
                    className={`search-result ${selected?.id === result.id ? "selected" : ""}`}
                    onClick={() => selectSearchResult(result.id)}
                    aria-pressed={selected?.id === result.id}
                  >
                    <ResultIcon kind={result.kind} />
                    <span className="search-result-copy">
                      <span className="search-result-heading">
                        <strong>{result.title}</strong>
                        <time
                          dateTime={
                            result.occurredAt
                              ? new Date(result.occurredAt).toISOString()
                              : undefined
                          }
                        >
                          {result.occurredAt
                            ? new Date(result.occurredAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : result.kind === "thread"
                              ? "Conversation"
                              : "Person"}
                        </time>
                      </span>
                      <span className="search-result-source">
                        {result.sourceLabel ||
                          (result.kind === "message"
                            ? "Message"
                            : result.kind === "thread"
                              ? "Conversation"
                              : "Person")}
                      </span>
                      <span className="search-result-snippet">
                        {highlightSnippet(result.snippet, search.query).map(
                          (part, index) =>
                            part.match ? (
                              <mark key={index}>{part.text}</mark>
                            ) : (
                              part.text
                            ),
                        )}
                      </span>
                      <span className="match-reason">
                        {formatMatchReason(result.matchReason)}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
      {selected && (
        <EvidencePreview
          result={selected}
          onClose={() => selectSearchResult(null)}
          onOpen={() => openResult(selected)}
        />
      )}
    </main>
  );
}
