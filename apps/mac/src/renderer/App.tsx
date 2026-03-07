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
import {
  Bot,
  Database,
  Download,
  KeyRound,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { Input } from "@/renderer/components/ui/input";

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

/* ─── Sidebar section ─── */
function SidebarSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Shield;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon size={14} className="text-muted-foreground" />
        {title}
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

/* ─── Conversation message ─── */
function ConversationBubble({ role, children }: { role: "assistant" | "user"; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
        role === "assistant"
          ? "bg-muted text-foreground"
          : "ml-auto bg-primary text-primary-foreground"
      }`}
    >
      {children}
    </div>
  );
}

/* ─── Search result ─── */
function SearchResultItem({ result }: { result: SearchResult }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 space-y-1">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{result.kind}</Badge>
        <span className="text-[11px] text-muted-foreground tabular-nums">{result.score.toFixed(2)}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{result.title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{result.snippet}</p>
    </div>
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
      window.openfolio.dashboard.getThreadSummaries(5),
      window.openfolio.dashboard.getReminderSuggestions(5),
    ]);

    setMessagesStatus(nextMessages);
    setMcpRunning(nextMcp.running);
    setThreads(nextThreads);
    setSuggestions(nextSuggestions);
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
    } catch (error) {
      setConversation((current) => [
        ...current,
        { id: `error-${Date.now()}`, role: "assistant", content: `Import failed: ${error instanceof Error ? error.message : "Unknown error"}` },
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
    } catch (error) {
      setConversation((current) => [
        ...current,
        { id: `error-${Date.now()}`, role: "assistant", content: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMcp() {
    try {
      const status = mcpRunning
        ? await window.openfolio.mcp.stop()
        : await window.openfolio.mcp.start();
      setMcpRunning(status.running);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Failed to toggle MCP.");
    }
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
    try {
      const nextState = await window.openfolio.updates.checkNow();
      setUpdateState(nextState);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Failed to check for updates.");
    }
  }

  async function installUpdate() {
    try {
      await window.openfolio.updates.installNow();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Failed to install update.");
    }
  }

  const capabilityBadges = (cloudStatus?.capabilities ?? []).map((capability) => (
    <Badge key={capability} variant="info">{capability}</Badge>
  ));

  return (
    <div className="shell">
      {/* Drag bar */}
      <div className="window-dragbar">
        <div className="window-dragbar-title">OpenFolio</div>
      </div>

      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight">OpenFolio</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Relationship memory for your Mac.
          </p>
        </div>

        <div className="h-px bg-border" />

        <SidebarSection icon={ShieldCheck} title="Messages Access">
          <Badge variant={messagesStatus?.status === "granted" ? "success" : "default"}>
            {messagesStatus?.status || "unknown"}
          </Badge>
          <p className="text-muted-foreground">{messagesStatus?.details || "Checking access..."}</p>
          <Button variant="secondary" size="sm" onClick={() => window.openfolio.messages.requestAccess().then(setMessagesStatus)}>
            Open Settings
          </Button>
        </SidebarSection>

        <div className="h-px bg-border" />

        <SidebarSection icon={KeyRound} title="Hosted Account">
          {isLoading ? <p className="text-muted-foreground">Checking...</p> : null}
          {!isLoading && !isAuthenticated ? (
            <>
              <p className="text-muted-foreground">Optional. Sign in for billing, hosted AI, or managed connectors.</p>
              <Button variant="secondary" size="sm" onClick={() => void startGoogleSignIn()}>
                Continue with Google
              </Button>
            </>
          ) : null}
          {isAuthenticated ? (
            <>
              <p className="text-foreground">{cloudStatus?.accountEmail || currentUser?.email || "Signed in"}</p>
              <div className="flex flex-wrap gap-1.5">{capabilityBadges.length > 0 ? capabilityBadges : <Badge variant="secondary">local-only</Badge>}</div>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                <LogOut size={14} />
                Sign Out
              </Button>
            </>
          ) : null}
          {cloudError ? <p className="text-sm text-destructive">{cloudError}</p> : null}
        </SidebarSection>

        <div className="h-px bg-border" />

        <SidebarSection icon={Database} title="Agent Access">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${mcpRunning ? "bg-accent" : "bg-border"}`} />
            <span className="text-muted-foreground">{mcpRunning ? "MCP running" : "MCP stopped"}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void toggleMcp()}>
            {mcpRunning ? "Stop MCP" : "Start MCP"}
          </Button>
        </SidebarSection>

        <div className="h-px bg-border" />

        <SidebarSection icon={Download} title="App Updates">
          <Badge variant={updateState?.status === "downloaded" ? "success" : "secondary"}>
            {updateState?.status || "idle"}
          </Badge>
          <p className="text-muted-foreground">{updateState?.message || "Checks GitHub Releases for updates."}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void checkForUpdates()}>
              Check Now
            </Button>
            {updateState?.status === "downloaded" ? (
              <Button size="sm" onClick={() => void installUpdate()}>
                Install
              </Button>
            ) : null}
          </div>
        </SidebarSection>
      </aside>

      {/* ─── Main ─── */}
      <main className="main">
        {/* Hero / Import */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Messages-first dashboard
              </p>
              <CardTitle>Import your relationship history</CardTitle>
            </div>
            <Button size="sm" onClick={() => void runImport()} disabled={busy}>
              <RefreshCw size={14} />
              Import
            </Button>
          </CardHeader>
          {importJob ? (
            <CardContent>
              <div className="flex gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{importJob.status}</Badge>
                <span>{importJob.importedMessages} messages</span>
                <span>{importJob.importedPeople} people</span>
                <span>{importJob.importedThreads} threads</span>
              </div>
            </CardContent>
          ) : null}
        </Card>

        {/* AI workspace + Response */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-6 rounded-md bg-primary">
                  <Bot size={14} className="text-primary-foreground" />
                </div>
                <CardTitle>AI Workspace</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Local OpenFolio runtime</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Conversation */}
              <div className="h-[280px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                {conversation.map((entry) => (
                  <ConversationBubble key={entry.id} role={entry.role}>
                    {entry.content}
                  </ConversationBubble>
                ))}
              </div>
              {/* Input */}
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about your relationships..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                />
                <Button size="sm" onClick={() => void runSearch()} disabled={busy || !query.trim()}>
                  <Sparkles size={14} />
                  Ask
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Answer */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="info">{answer?.provider ?? "local"}</Badge>
                <CardTitle>AI Answer</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {answer?.answer || "Ask a question to generate a grounded answer with citations from your local graph."}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search results + Runtime */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Search size={14} className="text-muted-foreground" />
                <CardTitle>Search Results</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No results yet.</p>
              ) : (
                results.map((result) => <SearchResultItem key={result.id} result={result} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-muted-foreground" />
                <CardTitle>Runtime Mode</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Usable before sign-in. Hosted features are optional.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="success">messages import</Badge>
                <Badge variant="success">local search</Badge>
                <Badge variant="success">local MCP</Badge>
                <Badge variant={isAuthenticated ? "info" : "warning"}>
                  {isAuthenticated ? "hosted enabled" : "hosted optional"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent threads + Follow-ups */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-muted-foreground" />
                <CardTitle>Recent Threads</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {threads.length === 0 ? (
                <p className="text-sm text-muted-foreground">Import Messages to populate.</p>
              ) : (
                threads.map((thread) => (
                  <div key={thread.threadId} className="rounded-lg border border-border bg-muted/50 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{thread.title}</p>
                    <p className="text-sm text-muted-foreground">{thread.lastMessagePreview || "No preview."}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-muted-foreground" />
                <CardTitle>Follow-up Suggestions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Import Messages to generate suggestions.</p>
              ) : (
                suggestions.map((suggestion) => (
                  <div key={suggestion.personId} className="rounded-lg border border-border bg-muted/50 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{suggestion.displayName}</p>
                    <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Hosted auth unavailable
          </p>
          <h1 className="text-xl font-bold tracking-tight">Could not load configuration.</h1>
          <p className="mt-2 text-sm text-destructive">{configError}</p>
        </div>
      </div>
    );
  }

  if (!runtimeConfig || !convexClient) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Preparing
          </p>
          <h1 className="text-xl font-bold tracking-tight">Loading OpenFolio.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Preparing your local graph and optional hosted connection.</p>
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
