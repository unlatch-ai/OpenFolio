import { useCallback, useEffect, useRef } from "react";
import { Command } from "cmdk";
import { Search, MessageSquare, User, FileText, Bell } from "lucide-react";
import { useAppStore } from "../store";
import type { SearchResult } from "@openfolio/shared-types";

const ICON_MAP: Record<string, typeof MessageSquare> = {
  thread: MessageSquare,
  person: User,
  message: MessageSquare,
  note: FileText,
  reminder: Bell,
};

function ResultIcon({ kind }: { kind: SearchResult["kind"] }) {
  const Icon = ICON_MAP[kind] ?? FileText;
  return <Icon size={14} className="shrink-0 text-muted-foreground" />;
}

export function CommandPalette() {
  const { commandPalette, closeCommandPalette, setCommandQuery, setCommandResults, selectThread, setView } =
    useAppStore();
  const { open, query, results, searching } = commandPalette;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cmd+K global shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useAppStore.getState().openCommandPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runSearch = useCallback(
    (text: string) => {
      setCommandQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!text.trim()) {
        setCommandResults([], false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const searchResults = await window.openfolio.search.query({ text, limit: 12 });
          setCommandResults(searchResults, false);
        } catch {
          setCommandResults([], false);
        }
      }, 200);
    },
    [setCommandQuery, setCommandResults],
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      closeCommandPalette();
      if (result.kind === "thread" || result.kind === "message") {
        const threadId = result.kind === "thread" ? result.entityId : result.entityId;
        setView("inbox");
        selectThread(threadId);
      }
    },
    [closeCommandPalette, selectThread, setView],
  );

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={closeCommandPalette}>
      <div className="cmd-container" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} loop>
          <div className="cmd-input-wrap">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <Command.Input
              value={query}
              onValueChange={runSearch}
              placeholder="Search conversations, people, notes..."
              className="cmd-input"
              autoFocus
            />
            <kbd className="cmd-kbd">esc</kbd>
          </div>

          <Command.List className="cmd-list">
            {query.length === 0 && (
              <Command.Empty className="cmd-empty">
                Start typing to search your messages...
              </Command.Empty>
            )}

            {searching && results.length === 0 && (
              <Command.Loading className="cmd-loading">
                Searching...
              </Command.Loading>
            )}

            {results.length > 0 && (
              <Command.Group heading="Results">
                {results.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleSelect(result)}
                    className="cmd-item"
                  >
                    <ResultIcon kind={result.kind} />
                    <div className="cmd-item-content">
                      <span className="cmd-item-title">{result.title}</span>
                      <span className="cmd-item-snippet">{result.snippet}</span>
                    </div>
                    <span className="cmd-item-kind">{result.kind}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!searching && query.length > 0 && results.length === 0 && (
              <Command.Empty className="cmd-empty">
                No results found.
              </Command.Empty>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
