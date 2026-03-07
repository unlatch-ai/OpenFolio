import { useEffect, useMemo, useState } from "react";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@openfolio/hosted";
import type {
  AskResponse,
  CloudAccountStatus,
  CloudRuntimeConfig,
  MessagesAccessStatus,
  MessagesImportJob,
  MessagesThreadSummary,
  ReminderSuggestion,
  SearchResult,
  UpdateState,
} from "@openfolio/shared-types";
import { Bot, Database, Download, KeyRound, LogOut, MessageSquare, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Conversation, ConversationMessage } from "@/renderer/components/ai/conversation";
import { PromptInput } from "@/renderer/components/ai/prompt-input";
import { ResponsePanel } from "@/renderer/components/ai/response";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";

declare global {
  interface Window {
    openfolio: import("@openfolio/shared-types").OpenFolioBridge;
  }
}

type OAuthActionResult = {
  redirect?: URL;
  signingIn: boolean;
};

type ConversationEntry = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const debugAuthFlow =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debugAuth") === "1";

function logAuthDebug(...args: unknown[]) {
  if (debugAuthFlow) {
    console.log("[openfolio-auth-renderer]", ...args);
  }
}

function logStoredAuthKeys() {
  if (!debugAuthFlow || typeof window === "undefined") {
    return;
  }

  const entries: Array<[string, string | null]> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.includes("__convexAuth")) {
      continue;
    }
    entries.push([key, window.localStorage.getItem(key)]);
  }

  logAuthDebug(
    "stored auth keys",
    JSON.stringify(
      entries.map(([key, value]) => ({
        key,
        present: value !== null,
        preview: value ? `${value.slice(0, 24)}...` : null,
      })),
    ),
  );
}

function Dashboard({ runtimeConfig }: { runtimeConfig: CloudRuntimeConfig }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [messagesStatus, setMessagesStatus] = useState<MessagesAccessStatus | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [importJob, setImportJob] = useState<MessagesImportJob | null>(null);
  const [threads, setThreads] = useState<MessagesThreadSummary[]>([]);
  const [suggestions, setSuggestions] = useState<ReminderSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([
    {
      id: "intro",
      role: "assistant",
      content: "OpenFolio is ready in local-first mode. Import Messages or sign in to unlock hosted capabilities.",
    },
  ]);

  const currentUser = useQuery(api.accounts.getCurrentUser, isAuthenticated ? {} : "skip");
  const cloudStatus = useQuery(api.accounts.getCloudStatus, isAuthenticated ? {} : "skip") as CloudAccountStatus | undefined;
  const registerCurrentDevice = useMutation(api.accounts.registerCurrentDevice);

  useEffect(() => {
    return window.openfolio.cloud.onAuthCallback((url) => {
      logAuthDebug("received auth callback", url);
      const callback = new URL(url);
      const code = callback.searchParams.get("code");
      const authError = callback.searchParams.get("error_description") || callback.searchParams.get("error");

      if (authError) {
        setCloudError(authError);
        return;
      }

      if (!code) {
        setCloudError("Google sign-in returned without an authorization code.");
        return;
      }

      void (signIn as unknown as (provider: string | undefined, params: { code: string }) => Promise<OAuthActionResult>)(undefined, { code })
        .then((result) => {
          logAuthDebug("callback signIn result", JSON.stringify(result));
          logStoredAuthKeys();
          if (result.redirect) {
            setCloudError("Google sign-in unexpectedly requested another redirect.");
            return;
          }

          if (result.signingIn) {
            window.location.reload();
          }
        })
        .catch((callbackError) => {
          setCloudError(callbackError instanceof Error ? callbackError.message : "Failed to finish sign-in.");
        });
    });
  }, [signIn]);

  async function refreshDashboard() {
    const [nextMessages, nextMcp, nextThreads, nextSuggestions] = await Promise.all([
      window.openfolio.messages.getAccessStatus(),
      window.openfolio.mcp.getStatus(),
      window.openfolio.db.query("SELECT id AS threadId, COALESCE(display_name, 'Message Thread') AS title, '' AS participantHandles, '' AS lastMessagePreview, last_message_at AS lastMessageAt FROM message_threads ORDER BY last_message_at DESC LIMIT 5"),
      window.openfolio.db.query(`
        SELECT personId, displayName, reason, suggestedDueAt
        FROM (
          SELECT
            p.id AS personId,
            p.display_name AS displayName,
            'No recent follow-up detected.' AS reason,
            COALESCE(MAX(mm.occurred_at), CAST(strftime('%s','now') AS INTEGER) * 1000) + 604800000 AS suggestedDueAt
          FROM people p
          LEFT JOIN message_participants mp ON mp.person_id = p.id
          LEFT JOIN message_messages mm ON mm.thread_id = mp.thread_id
          GROUP BY p.id
          ORDER BY MAX(mm.occurred_at) ASC
          LIMIT 5
        )
      `),
    ]);

    setMessagesStatus(nextMessages);
    setMcpRunning(nextMcp.running);
    setThreads(nextThreads as MessagesThreadSummary[]);
    setSuggestions(nextSuggestions as ReminderSuggestion[]);
  }

  useEffect(() => {
    void refreshDashboard().catch(console.error);
  }, []);

  useEffect(() => {
    window.openfolio.updates.getState()
      .then(setUpdateState)
      .catch(console.error);

    return window.openfolio.updates.onStateChange(setUpdateState);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || registeredUserId === currentUser.id) {
      return;
    }

    void registerCurrentDevice({
      deviceName: runtimeConfig.deviceName,
      platform: runtimeConfig.platform,
    })
      .then(() => {
        setRegisteredUserId(currentUser.id);
      })
      .catch((error) => {
        setCloudError(error instanceof Error ? error.message : "Failed to register this Mac with your account.");
      });
  }, [currentUser?.id, isAuthenticated, registerCurrentDevice, registeredUserId, runtimeConfig.deviceName, runtimeConfig.platform]);

  async function startGoogleSignIn() {
    setCloudError(null);
    try {
      const authSession = await window.openfolio.cloud.beginAuthSession();
      const result = (await signIn("google", {
        redirectTo: authSession.redirectUri,
      })) as OAuthActionResult;
      logStoredAuthKeys();
      if (result.redirect) {
        await window.openfolio.cloud.openExternal(result.redirect.toString());
      }
    } catch (signInError) {
      setCloudError(signInError instanceof Error ? signInError.message : "Failed to start Google sign-in.");
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const job = await window.openfolio.messages.startImport();
      setImportJob(job);
      await refreshDashboard();
      setConversation((current) => [
        ...current,
        {
          id: `import-${job.id}`,
          role: "assistant",
          content: `Imported ${job.importedMessages} messages across ${job.importedThreads} threads and ${job.importedPeople} people.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) {
      return;
    }

    const nextQuestion = query;
    setBusy(true);
    setConversation((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: nextQuestion }]);

    try {
      const [searchResults, askResponse] = await Promise.all([
        window.openfolio.search.query({ text: nextQuestion, limit: 8 }),
        window.openfolio.ai.run({ query: nextQuestion }),
      ]);
      setResults(searchResults);
      setAnswer(askResponse);
      setConversation((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: askResponse.answer }]);
      setQuery("");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMcp() {
    const status = mcpRunning
      ? await window.openfolio.mcp.stop()
      : await window.openfolio.mcp.start();
    setMcpRunning(status.running);
  }

  async function handleSignOut() {
    setCloudError(null);
    try {
      await signOut();
      setRegisteredUserId(null);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Failed to sign out.");
    }
  }

  async function checkForUpdates() {
    const nextState = await window.openfolio.updates.checkNow();
    setUpdateState(nextState);
  }

  async function installUpdate() {
    await window.openfolio.updates.installNow();
  }

  const capabilityBadges = (cloudStatus?.capabilities ?? []).map((capability) => (
    <Badge key={capability} variant="info">{capability}</Badge>
  ));

  return (
    <div className="shell">
      <div className="window-dragbar">
        <div className="window-dragbar-title">OpenFolio</div>
      </div>
      <aside className="sidebar">
        <div>
          <p className="eyebrow">OpenFolio</p>
          <h1>Relationship memory for your Mac.</h1>
          <p className="lede">
            Local-first. Messages-first. BYOK-friendly. Optional account for hosted services.
          </p>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <ShieldCheck size={18} />
              <strong>Messages Access</strong>
            </div>
            <p className={`pill pill-${messagesStatus?.status || "unknown"}`}>{messagesStatus?.status || "unknown"}</p>
            <p>{messagesStatus?.details || "Checking access..."}</p>
            <button className="button subtle" onClick={() => window.openfolio.messages.requestAccess().then(setMessagesStatus)}>
              Open Full Disk Access Settings
            </button>
          </section>

          <section className="card">
            <div className="card-header">
              <KeyRound size={18} />
              <strong>Hosted Account</strong>
            </div>
            {isLoading ? <p>Checking account state…</p> : null}
            {!isLoading && !isAuthenticated ? (
              <>
                <p>Optional. Sign in only when you want billing, managed connectors, hosted AI, or future hosted MCP access.</p>
                <button className="button subtle" onClick={() => void startGoogleSignIn()}>
                  Continue with Google
                </button>
              </>
            ) : null}
            {isAuthenticated ? (
              <>
                <p>{cloudStatus?.accountEmail || currentUser?.email || "Signed in"}</p>
                <div className="inline-actions">{capabilityBadges.length > 0 ? capabilityBadges : <Badge>local-only</Badge>}</div>
                <button className="button subtle" onClick={() => void handleSignOut()}>
                  <LogOut size={16} />
                  Sign Out
                </button>
              </>
            ) : null}
            {cloudError ? <p className="error-text">{cloudError}</p> : null}
          </section>

          <section className="card">
            <div className="card-header">
              <Database size={18} />
              <strong>Local Agent Access</strong>
            </div>
            <p>{mcpRunning ? "MCP is marked as running." : "MCP is currently stopped."}</p>
            <button className="button subtle" onClick={() => void toggleMcp()}>
              {mcpRunning ? "Stop MCP" : "Start MCP"}
            </button>
          </section>

          <section className="card">
            <div className="card-header">
              <Download size={18} />
              <strong>App Updates</strong>
            </div>
            <p className={`pill pill-${updateState?.status || "unknown"}`}>{updateState?.status || "idle"}</p>
            <p>{updateState?.message || "Checks GitHub Releases for signed OpenFolio updates."}</p>
            <div className="inline-actions">
              <button className="button subtle" onClick={() => void checkForUpdates()}>
                Check Now
              </button>
              {updateState?.status === "downloaded" ? (
                <button className="button primary" onClick={() => void installUpdate()}>
                  Install Update
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </aside>

      <main className="main">
        <section className="hero-panel">
          <div className="hero-header">
            <div>
              <p className="eyebrow">Messages-first dashboard</p>
              <h2>Import your relationship history, then ask natural questions.</h2>
            </div>
            <button className="button primary" onClick={() => void runImport()} disabled={busy}>
              <RefreshCw size={16} />
              Import Messages
            </button>
          </div>

          {importJob ? (
            <div className="import-summary">
              <span>{importJob.status}</span>
              <span>{importJob.importedMessages} messages</span>
              <span>{importJob.importedPeople} people</span>
              <span>{importJob.importedThreads} threads</span>
            </div>
          ) : null}
        </section>

        <section className="grid">
          <Card className="large !p-5">
            <CardHeader>
              <Bot size={18} />
              <div>
                <p className="eyebrow !mb-1">AI workspace</p>
                <CardTitle>Ask through the local OpenFolio runtime.</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Conversation>
                {conversation.map((entry) => (
                  <ConversationMessage key={entry.id} role={entry.role}>
                    {entry.content}
                  </ConversationMessage>
                ))}
              </Conversation>
              <PromptInput value={query} onChange={setQuery} onSubmit={() => void runSearch()} disabled={busy} />
            </CardContent>
          </Card>

          <ResponsePanel response={answer} />
        </section>

        <section className="grid">
          <Card className="large">
            <CardHeader>
              <Search size={18} />
              <CardTitle>Search Results</CardTitle>
            </CardHeader>
            <CardContent className="result-list">
              {results.length === 0 ? <p>No results yet.</p> : results.map((result) => (
                <article key={result.id} className="result">
                  <div className="result-meta">
                    <span>{result.kind}</span>
                    <span>{result.score.toFixed(2)}</span>
                  </div>
                  <strong>{result.title}</strong>
                  <p>{result.snippet}</p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="large">
            <CardHeader>
              <ShieldCheck size={18} />
              <CardTitle>Runtime Mode</CardTitle>
            </CardHeader>
            <CardContent>
              <p>The app is usable before sign-in. Hosted account features are layered on top, not required for local graph access.</p>
              <div className="inline-actions">
                <Badge variant="success">messages import</Badge>
                <Badge variant="success">local search</Badge>
                <Badge variant="success">local MCP</Badge>
                <Badge variant={isAuthenticated ? "info" : "warning"}>{isAuthenticated ? "hosted enabled" : "hosted optional"}</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid">
          <section className="card">
            <div className="card-header">
              <MessageSquare size={18} />
              <strong>Recent Threads</strong>
            </div>
            <div className="result-list">
              {threads.length === 0 ? <p>Import Messages to populate this panel.</p> : threads.map((thread) => (
                <article key={thread.threadId} className="result">
                  <strong>{thread.title}</strong>
                  <p>{thread.lastMessagePreview || "No preview available yet."}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <RefreshCw size={18} />
              <strong>Follow-up Suggestions</strong>
            </div>
            <div className="result-list">
              {suggestions.length === 0 ? <p>Import Messages to generate follow-up suggestions.</p> : suggestions.map((suggestion) => (
                <article key={suggestion.personId} className="result">
                  <strong>{suggestion.displayName}</strong>
                  <p>{suggestion.reason}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export function App() {
  const [runtimeConfig, setRuntimeConfig] = useState<CloudRuntimeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    window.openfolio.cloud.getConfig()
      .then(setRuntimeConfig)
      .catch((error) => {
        setConfigError(error instanceof Error ? error.message : "Failed to load hosted auth configuration.");
      });
  }, []);

  const convexClient = useMemo(() => {
    if (!runtimeConfig?.convexUrl) {
      return null;
    }

    return new ConvexReactClient(runtimeConfig.convexUrl);
  }, [runtimeConfig?.convexUrl]);

  if (configError) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="eyebrow">Hosted auth unavailable</p>
          <h1>OpenFolio could not load the hosted auth configuration.</h1>
          <p className="error-text">{configError}</p>
        </div>
      </div>
    );
  }

  if (!runtimeConfig || !convexClient) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="eyebrow">Preparing</p>
          <h1>Loading OpenFolio.</h1>
          <p className="lede">Preparing your local graph and optional hosted connection.</p>
        </div>
      </div>
    );
  }

  return (
    <ConvexAuthProvider client={convexClient}>
      <Dashboard runtimeConfig={runtimeConfig} />
    </ConvexAuthProvider>
  );
}
