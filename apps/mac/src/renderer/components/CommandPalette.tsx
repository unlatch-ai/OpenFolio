import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { Search, MessageSquare, User, FileText, Bell, Sparkles } from "lucide-react";
import { useAppStore } from "../store";
import type { AiSettingsStatus, AskResponse, SearchResult } from "@openfolio/shared-types";
import { groupSearchResults } from "../search-results";

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
  const { commandPalette, closeCommandPalette, setCommandQuery, setCommandResults, selectThread, selectMessage, selectPerson, setView } =
    useAppStore();
  const { open, query, results, searching } = commandPalette;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsStatus | null>(null);

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

  useEffect(() => {
    if (!open) return;
    void window.openfolio.ai.getSettings().then(setAiSettings).catch(() => setAiSettings(null));
  }, [open]);

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
      if (result.personId) {
        setView("people");
        selectPerson(result.personId);
      } else if (result.threadId) {
        setView("inbox");
        selectThread(result.threadId);
        selectMessage(result.messageId ?? null);
      }
    },
    [closeCommandPalette, selectThread, selectMessage, selectPerson, setView],
  );

  const runAsk = useCallback(async () => {
    if (!query.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const response = await window.openfolio.ai.run({ query });
      setAnswer(response);
      setCommandResults(response.citations, false);
    } catch {
      setAnswer({ answer: "Ask failed. Check your OpenAI key in Settings or try a narrower query.", citations: [], provider: "local" });
    } finally {
      setAsking(false);
    }
  }, [query, setCommandResults]);

  const groupedResults = groupSearchResults(results);

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={closeCommandPalette}>
      <div className="cmd-container" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} loop>
          <div className="cmd-input-wrap">
            {mode === "ask" ? <Sparkles size={16} className="text-muted-foreground shrink-0" /> : <Search size={16} className="text-muted-foreground shrink-0" />}
            <Command.Input
              value={query}
              onValueChange={(value) => {
                setAnswer(null);
                if (mode === "search") runSearch(value);
                else setCommandQuery(value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && mode === "ask") {
                  event.preventDefault();
                  void runAsk();
                }
              }}
              placeholder={mode === "ask" ? "Ask about your message history..." : "Search conversations, people, notes..."}
              className="cmd-input"
              autoFocus
            />
            <kbd className="cmd-kbd">esc</kbd>
          </div>

          <div className="cmd-mode-row">
            <button className={mode === "search" ? "active" : ""} onClick={() => { setMode("search"); setAnswer(null); runSearch(query); }}>Search</button>
            <button className={mode === "ask" ? "active" : ""} onClick={() => { setMode("ask"); setAnswer(null); setCommandResults([], false); }}>Ask</button>
            {mode === "ask" && (
              <span className="cmd-mode-hint">
                {aiSettings?.hasOpenAIKey ? "BYOK OpenAI enabled" : "Local citations only until you add an OpenAI key"}
              </span>
            )}
            {mode === "ask" && <button className="cmd-ask-button" onClick={() => void runAsk()} disabled={asking || !query.trim()}>{asking ? "Asking..." : "Ask"}</button>}
          </div>

          <Command.List className="cmd-list">
            {answer && (
              <div className="cmd-answer">
                <strong>{answer.provider === "openai" ? "OpenAI answer with local citations" : "Local retrieval summary"}</strong>
                <p>{answer.answer}</p>
              </div>
            )}

            {query.length === 0 && !answer && (
              <Command.Empty className="cmd-empty">
                {mode === "ask" ? "Ask a question about your messages." : "Start typing to search your messages..."}
              </Command.Empty>
            )}

            {searching && results.length === 0 && (
              <Command.Loading className="cmd-loading">
                Searching...
              </Command.Loading>
            )}

            {results.length > 0 && Object.entries(groupedResults).map(([kind, kindResults]) => (
              <Command.Group key={kind} heading={mode === "ask" ? `${kind} citations` : kind}>
                {kindResults.map((result) => (
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
                  <span className="cmd-item-kind">{result.messageId ? "message" : result.kind}</span>
                </Command.Item>
                ))}
              </Command.Group>
            ))}

            {!searching && query.length > 0 && results.length === 0 && !asking && !answer && (
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
