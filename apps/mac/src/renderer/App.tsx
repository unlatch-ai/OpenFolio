import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@openfolio/hosted";
import type {
  AskResponse,
  CloudAccountStatus,
  CloudRuntimeConfig,
  ContactsAccessStatus,
  ContactsSyncSummary,
  MessagesAccessStatus,
  MessagesImportJob,
  MessagesThreadSummary,
  ReminderSuggestion,
  SearchResult,
  UpdateState,
} from "@openfolio/shared-types";
import {
  ChevronDown,
  ChevronRight,
  Download,
  LogOut,
  MessageSquare,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Separator } from "@/renderer/components/ui/separator";
import { Switch } from "@/renderer/components/ui/switch";
import { Toaster } from "@/renderer/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarSeparator,
} from "@/renderer/components/ui/sidebar";
import { useTheme, type Theme } from "@/lib/use-theme";

declare global {
  interface Window {
    openfolio: import("@openfolio/shared-types").OpenFolioBridge;
  }
}

type OAuthActionResult = {
  redirect?: URL;
  signingIn: boolean;
};

type View = "conversations" | "activity" | "settings";

type ConversationEntry = {
  id: string;
  role: "assistant" | "user";
  content: string;
  sources?: SearchResult[];
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

/* ─── Collapsible sources under AI responses ─── */
function Sources({ results }: { results: SearchResult[] }) {
  const [open, setOpen] = useState(false);
  if (results.length === 0) return null;
  return (
    <div className="message-sources">
      <button className="sources-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {results.length} source{results.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="sources-list">
          {results.map((r) => (
            <div key={r.id} className="source-item">
              <span className="source-item-title">{r.title}</span>
              <span className="source-item-meta">{r.kind} &middot; {r.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Conversations view ─── */
function ConversationsView({
  conversation,
  query,
  setQuery,
  onSend,
  busy,
  hasData,
  onImport,
  messagesStatus,
  onRequestAccess,
}: {
  conversation: ConversationEntry[];
  query: string;
  setQuery: (q: string) => void;
  onSend: () => void;
  busy: boolean;
  hasData: boolean;
  onImport: () => void;
  messagesStatus: MessagesAccessStatus | null;
  onRequestAccess: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length]);

  return (
    <div className="conversations-view">
      <div className="conversations-header">
        <h2>OpenFolio AI</h2>
        <div className="conversations-header-meta">
          <span className="status-dot on" />
          Local
        </div>
      </div>

      <div className="conversation-scroll" ref={scrollRef}>
        <div className="conversation-messages">
          {conversation.map((entry) => (
            <div key={entry.id} className={`message ${entry.role}`}>
              <span className="message-label">
                {entry.role === "assistant" ? "OpenFolio" : "You"}
              </span>
              <div className="message-bubble">{entry.content}</div>
              {entry.sources && entry.sources.length > 0 && (
                <Sources results={entry.sources} />
              )}
            </div>
          ))}

          {!hasData && (
            <div className="onboarding-card">
              <h3>Get started</h3>
              <p>
                Import your iMessage history to build your local relationship graph. Everything stays on this Mac.
              </p>
              <div className="onboarding-actions">
                {messagesStatus?.status !== "granted" ? (
                  <Button variant="secondary" size="sm" onClick={onRequestAccess}>
                    Grant Messages Access
                  </Button>
                ) : (
                  <Button size="sm" onClick={onImport} disabled={busy}>
                    <RefreshCw size={14} />
                    Import Messages
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="input-bar">
        <div className="input-bar-inner">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about your relationships..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <span className="input-shortcut">Enter</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Activity view ─── */
function ActivityView({
  threads,
  suggestions,
}: {
  threads: MessagesThreadSummary[];
  suggestions: ReminderSuggestion[];
}) {
  return (
    <div className="activity-view">
      <div className="activity-inner">
        {suggestions.length > 0 && (
          <div className="activity-section">
            <h3 className="activity-section-title">Follow up</h3>
            {suggestions.map((s) => (
              <div key={s.personId} className="activity-item">
                <p className="activity-item-name">{s.displayName}</p>
                <p className="activity-item-detail">{s.reason}</p>
              </div>
            ))}
          </div>
        )}

        <div className="activity-section">
          <h3 className="activity-section-title">Recent threads</h3>
          {threads.length === 0 ? (
            <p className="activity-empty">Import messages to see recent threads.</p>
          ) : (
            threads.map((t) => (
              <div key={t.threadId} className="activity-item">
                <p className="activity-item-name">{t.title}</p>
                <p className="activity-item-detail">{t.lastMessagePreview || "No preview."}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Settings view ─── */
function SettingsView({
  messagesStatus,
  contactsStatus,
  contactsSync,
  isAuthenticated,
  isLoading,
  cloudStatus,
  currentUserEmail,
  mcpRunning,
  updateState,
  importJob,
  busy,
  cloudError,
  theme,
  onRequestMessages,
  onRequestContacts,
  onSyncContacts,
  onImport,
  onSignIn,
  onSignOut,
  onToggleMcp,
  onCheckUpdates,
  onInstallUpdate,
  onSetTheme,
}: {
  messagesStatus: MessagesAccessStatus | null;
  contactsStatus: ContactsAccessStatus | null;
  contactsSync: ContactsSyncSummary | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  cloudStatus: CloudAccountStatus | undefined;
  currentUserEmail: string | undefined;
  mcpRunning: boolean;
  updateState: UpdateState | null;
  importJob: MessagesImportJob | null;
  busy: boolean;
  cloudError: string | null;
  theme: Theme;
  onRequestMessages: () => void;
  onRequestContacts: () => void;
  onSyncContacts: () => void;
  onImport: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleMcp: () => void;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
  onSetTheme: (theme: Theme) => void;
}) {
  const capabilityBadges = (cloudStatus?.capabilities ?? []).map((c) => (
    <Badge key={c} variant="info">{c}</Badge>
  ));

  return (
    <div className="settings-view">
      <div className="settings-inner">
        {/* Appearance */}
        <div className="settings-group">
          <h3 className="settings-group-title">Appearance</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Theme</p>
              <p className="settings-row-detail">Choose light, dark, or match your system setting.</p>
            </div>
            <div className="settings-row-actions">
              <div className="theme-toggle">
                {(["light", "dark", "system"] as const).map((option) => (
                  <button
                    key={option}
                    className={`theme-toggle-option ${theme === option ? "active" : ""}`}
                    onClick={() => onSetTheme(option)}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Data Sources */}
        <div className="settings-group">
          <h3 className="settings-group-title">Data Sources</h3>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Messages</p>
              <p className="settings-row-detail">
                {messagesStatus?.details || "Checking access..."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={messagesStatus?.status === "granted" ? "success" : "default"}>
                {messagesStatus?.status || "unknown"}
              </Badge>
              <Button variant="secondary" size="xs" onClick={onRequestMessages}>
                Open Settings
              </Button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Import</p>
              <p className="settings-row-detail">
                {importJob
                  ? `Last import: ${importJob.importedMessages} messages, ${importJob.importedPeople} people, ${importJob.importedThreads} threads`
                  : "Import your iMessage history into the local graph."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Button size="xs" onClick={onImport} disabled={busy}>
                <RefreshCw size={12} />
                Import
              </Button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Contacts</p>
              <p className="settings-row-detail">
                {contactsSync
                  ? `Last sync: ${contactsSync.importedContacts} contacts`
                  : "Resolve phone numbers and emails to real names."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={contactsStatus?.status === "granted" ? "success" : "default"}>
                {contactsStatus?.status || "unknown"}
              </Badge>
              {contactsStatus?.status !== "granted" ? (
                <Button variant="secondary" size="xs" onClick={onRequestContacts}>
                  Allow
                </Button>
              ) : (
                <Button size="xs" onClick={onSyncContacts} disabled={busy}>
                  Sync
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="settings-group">
          <h3 className="settings-group-title">Account</h3>

          {isLoading ? (
            <p className="settings-row-detail">Checking...</p>
          ) : !isAuthenticated ? (
            <div className="settings-row">
              <div className="settings-row-info">
                <p className="settings-row-label">Hosted account</p>
                <p className="settings-row-detail">
                  Optional. Sign in for billing, hosted AI, or managed connectors.
                </p>
              </div>
              <div className="settings-row-actions">
                <Button variant="secondary" size="xs" onClick={onSignIn}>
                  Continue with Google
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-row">
              <div className="settings-row-info">
                <p className="settings-row-label">
                  {cloudStatus?.accountEmail || currentUserEmail || "Signed in"}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {capabilityBadges.length > 0 ? capabilityBadges : <Badge variant="secondary">local-only</Badge>}
                </div>
              </div>
              <div className="settings-row-actions">
                <Button variant="ghost" size="xs" onClick={onSignOut}>
                  <LogOut size={12} />
                  Sign Out
                </Button>
              </div>
            </div>
          )}

          {cloudError && (
            <p className="text-sm text-destructive mt-2">{cloudError}</p>
          )}
        </div>

        {/* Integrations */}
        <div className="settings-group">
          <h3 className="settings-group-title">Integrations</h3>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">MCP Server</p>
              <p className="settings-row-detail">
                Expose your relationship graph to AI agents via the Model Context Protocol.
              </p>
            </div>
            <div className="settings-row-actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={mcpRunning}
                      onCheckedChange={() => onToggleMcp()}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {mcpRunning ? "Stop MCP server" : "Start MCP server"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="settings-group">
          <h3 className="settings-group-title">About</h3>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">App Updates</p>
              <p className="settings-row-detail">
                {updateState?.message || "Checks GitHub Releases for updates."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={updateState?.status === "downloaded" ? "success" : "secondary"}>
                {updateState?.status || "idle"}
              </Badge>
              <Button variant="secondary" size="xs" onClick={onCheckUpdates}>
                Check
              </Button>
              {updateState?.status === "downloaded" && (
                <Button size="xs" onClick={onInstallUpdate}>
                  Install
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard (main authenticated shell) ─── */
function Dashboard({ runtimeConfig }: { runtimeConfig: CloudRuntimeConfig }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<View>("conversations");
  const [messagesStatus, setMessagesStatus] = useState<MessagesAccessStatus | null>(null);
  const [contactsStatus, setContactsStatus] = useState<ContactsAccessStatus | null>(null);
  const [contactsSync, setContactsSync] = useState<ContactsSyncSummary | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [importJob, setImportJob] = useState<MessagesImportJob | null>(null);
  const [threads, setThreads] = useState<MessagesThreadSummary[]>([]);
  const [suggestions, setSuggestions] = useState<ReminderSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([
    {
      id: "intro",
      role: "assistant",
      content: "Hi! I can help you search your message history and understand your relationships. Ask me anything.",
    },
  ]);

  const currentUser = useQuery(api.accounts.getCurrentUser, isAuthenticated ? {} : "skip");
  const cloudStatus = useQuery(api.accounts.getCloudStatus, isAuthenticated ? {} : "skip") as CloudAccountStatus | undefined;
  const registerCurrentDevice = useMutation(api.accounts.registerCurrentDevice);

  // Auth callback handler
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
    const [nextMessages, nextContacts, nextMcp, nextThreads, nextSuggestions] = await Promise.all([
      window.openfolio.messages.getAccessStatus(),
      window.openfolio.contacts.getAccessStatus(),
      window.openfolio.mcp.getStatus(),
      window.openfolio.dashboard.getThreadSummaries(5),
      window.openfolio.dashboard.getReminderSuggestions(5),
    ]);

    setMessagesStatus(nextMessages);
    setContactsStatus(nextContacts);
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

  // Actions
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
      toast.success(`Imported ${job.importedMessages} messages across ${job.importedThreads} threads`);
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncContacts() {
    setBusy(true);
    try {
      const summary = await window.openfolio.contacts.sync();
      setContactsSync(summary);
      await refreshDashboard();
      toast.success(`Synced ${summary.importedContacts} contacts`);
    } catch (error) {
      toast.error(`Contacts sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) return;

    const nextQuestion = query;
    setBusy(true);
    setConversation((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: nextQuestion }]);

    try {
      const [searchResults, askResponse] = await Promise.all([
        window.openfolio.search.query({ text: nextQuestion, limit: 8 }),
        window.openfolio.ai.run({ query: nextQuestion }),
      ]);
      setConversation((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: askResponse.answer,
          sources: searchResults,
        },
      ]);
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
      toast(status.running ? "MCP server started" : "MCP server stopped");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle MCP.");
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
      toast.error(error instanceof Error ? error.message : "Failed to check for updates.");
    }
  }

  async function installUpdate() {
    try {
      await window.openfolio.updates.installNow();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to install update.");
    }
  }

  const hasData = threads.length > 0;

  const navItems: Array<{ id: View; icon: typeof Sparkles; label: string }> = [
    { id: "conversations", icon: Sparkles, label: "Conversations" },
    { id: "activity", icon: Zap, label: "Activity" },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        <div className="window-drag-region" />

        <SidebarProvider defaultOpen={true} style={{ height: "100vh" }}>
          <Sidebar collapsible="icon" className="border-r border-sidebar-border">
            <SidebarHeader className="px-3 pb-2 pt-8">
              <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
                  O
                </div>
                <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                  OpenFolio
                </span>
              </div>
            </SidebarHeader>

            <SidebarSeparator />

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Navigate</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={view === item.id}
                          onClick={() => setView(item.id)}
                          tooltip={item.label}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Status</SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="flex flex-col gap-2 px-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <span className={`status-dot ${messagesStatus?.status === "granted" ? "on" : "off"}`} />
                          <span className="group-data-[collapsible=icon]:hidden">
                            Messages {messagesStatus?.status === "granted" ? "connected" : "not connected"}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Messages {messagesStatus?.status === "granted" ? "connected" : "not connected"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <span className={`status-dot ${mcpRunning ? "on" : "off"}`} />
                          <span className="group-data-[collapsible=icon]:hidden">
                            MCP {mcpRunning ? "running" : "stopped"}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        MCP {mcpRunning ? "running" : "stopped"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "settings"}
                    onClick={() => setView("settings")}
                    tooltip="Settings"
                  >
                    <Settings />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              {isAuthenticated && (
                <div className="px-3 pb-1 text-[11px] text-sidebar-foreground/50 truncate group-data-[collapsible=icon]:hidden">
                  {cloudStatus?.accountEmail || currentUser?.email || "Signed in"}
                </div>
              )}
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="overflow-hidden">
            {view === "conversations" && (
              <ConversationsView
                conversation={conversation}
                query={query}
                setQuery={setQuery}
                onSend={() => void runSearch()}
                busy={busy}
                hasData={hasData}
                onImport={() => void runImport()}
                messagesStatus={messagesStatus}
                onRequestAccess={() => {
                  window.openfolio.messages.requestAccess().then(setMessagesStatus);
                }}
              />
            )}
            {view === "activity" && (
              <ActivityView threads={threads} suggestions={suggestions} />
            )}
            {view === "settings" && (
              <SettingsView
                messagesStatus={messagesStatus}
                contactsStatus={contactsStatus}
                contactsSync={contactsSync}
                isAuthenticated={isAuthenticated}
                isLoading={isLoading}
                cloudStatus={cloudStatus}
                currentUserEmail={currentUser?.email ?? undefined}
                mcpRunning={mcpRunning}
                updateState={updateState}
                importJob={importJob}
                busy={busy}
                cloudError={cloudError}
                theme={theme}
                onRequestMessages={() => {
                  window.openfolio.messages.requestAccess().then(setMessagesStatus);
                }}
                onRequestContacts={() => {
                  window.openfolio.contacts.requestAccess().then(setContactsStatus);
                }}
                onSyncContacts={() => void syncContacts()}
                onImport={() => void runImport()}
                onSignIn={() => void startGoogleSignIn()}
                onSignOut={() => void handleSignOut()}
                onToggleMcp={() => void toggleMcp()}
                onCheckUpdates={() => void checkForUpdates()}
                onInstallUpdate={() => void installUpdate()}
                onSetTheme={setTheme}
              />
            )}
          </SidebarInset>
        </SidebarProvider>

        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

export function App() {
  const [runtimeConfig, setRuntimeConfig] = useState<CloudRuntimeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Apply theme on initial load (before Convex is ready)
  useTheme();

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
