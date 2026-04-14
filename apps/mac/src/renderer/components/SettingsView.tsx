import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@openfolio/hosted";
import type { CloudAccountStatus } from "@openfolio/shared-types";
import { Download, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useTheme, type Theme } from "@/lib/use-theme";
import { useAppStore } from "../store";

type OAuthActionResult = { redirect?: URL; signingIn: boolean };

export function SettingsView() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const { theme, setTheme } = useTheme();

  const {
    messagesStatus,
    contactsStatus,
    contactsSync,
    mcpRunning,
    updateState,
    importJob,
    busy,
    cloudConfig,
    cloudError,
    setMessagesStatus,
    setContactsStatus,
    setContactsSync,
    setMcpRunning,
    setImportJob,
    setBusy,
    setCloudError,
    setThreads,
    setThreadSummaries,
  } = useAppStore();

  const currentUser = useQuery(api.accounts.getCurrentUser, isAuthenticated ? {} : "skip");
  const cloudStatus = useQuery(api.accounts.getCloudStatus, isAuthenticated ? {} : "skip") as CloudAccountStatus | undefined;
  const registerCurrentDevice = useMutation(api.accounts.registerCurrentDevice);

  // Register device on sign-in
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || registeredUserId === currentUser.id || !cloudConfig) return;
    void registerCurrentDevice({
      deviceName: cloudConfig.deviceName,
      platform: cloudConfig.platform,
    })
      .then(() => setRegisteredUserId(currentUser.id))
      .catch((err) => setCloudError(err instanceof Error ? err.message : "Failed to register device."));
  }, [currentUser?.id, isAuthenticated, registerCurrentDevice, registeredUserId, cloudConfig, setCloudError]);

  // Auth callback
  useEffect(() => {
    return window.openfolio.cloud.onAuthCallback((url) => {
      const callback = new URL(url);
      const code = callback.searchParams.get("code");
      const authError = callback.searchParams.get("error_description") || callback.searchParams.get("error");
      if (authError) { setCloudError(authError); return; }
      if (!code) { setCloudError("Google sign-in returned without an authorization code."); return; }

      void (signIn as unknown as (provider: string | undefined, params: { code: string }) => Promise<OAuthActionResult>)(undefined, { code })
        .then((result) => {
          if (result.redirect) { setCloudError("Unexpected redirect."); return; }
          if (result.signingIn) window.location.reload();
        })
        .catch((e) => setCloudError(e instanceof Error ? e.message : "Sign-in failed."));
    });
  }, [signIn, setCloudError]);

  const startGoogleSignIn = useCallback(async () => {
    setCloudError(null);
    try {
      const authSession = await window.openfolio.cloud.beginAuthSession();
      const result = (await signIn("google", { redirectTo: authSession.redirectUri })) as OAuthActionResult;
      if (result.redirect) await window.openfolio.cloud.openExternal(result.redirect.toString());
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Failed to start sign-in.");
    }
  }, [signIn, setCloudError]);

  const runImport = useCallback(async () => {
    setBusy(true);
    try {
      const job = await window.openfolio.messages.startImport();
      setImportJob(job);
      if (job.status === "completed") {
        toast.success(`Imported ${job.importedMessages} messages`);
        const threads = await window.openfolio.threads.list({ limit: 50 });
        setThreads(threads);
      } else {
        toast.error(job.error || "Import failed.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }, [setBusy, setImportJob, setThreads]);

  const syncContacts = useCallback(async () => {
    setBusy(true);
    try {
      const summary = await window.openfolio.contacts.sync();
      setContactsSync(summary);
      toast.success(`Synced ${summary.importedContacts} contacts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Contacts sync failed.");
    } finally {
      setBusy(false);
    }
  }, [setBusy, setContactsSync]);

  const toggleMcp = useCallback(async () => {
    try {
      const status = mcpRunning ? await window.openfolio.mcp.stop() : await window.openfolio.mcp.start();
      setMcpRunning(status.running);
      toast(status.running ? "MCP server started" : "MCP server stopped");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle MCP.");
    }
  }, [mcpRunning, setMcpRunning]);

  return (
    <div className="settings-view">
      <div className="settings-inner">
        {/* Appearance */}
        <div className="settings-group">
          <h3 className="settings-group-title">Appearance</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Theme</p>
              <p className="settings-row-detail">Choose light, dark, or match your system.</p>
            </div>
            <div className="settings-row-actions">
              <div className="theme-toggle">
                {(["light", "dark", "system"] as const).map((option) => (
                  <button
                    key={option}
                    className={`theme-toggle-option ${theme === option ? "active" : ""}`}
                    onClick={() => setTheme(option)}
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
              <p className="settings-row-detail">{messagesStatus?.details || "Checking..."}</p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={messagesStatus?.status === "granted" ? "success" : "default"}>
                {messagesStatus?.status || "unknown"}
              </Badge>
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  const s = await window.openfolio.messages.requestAccess();
                  setMessagesStatus(s);
                  if (s.status === "granted") toast.success("Messages access granted!");
                }}
              >
                {messagesStatus?.status === "granted" ? "Recheck" : "Grant Access"}
              </Button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Import</p>
              <p className="settings-row-detail">
                {importJob
                  ? `Last: ${importJob.importedMessages} messages, ${importJob.importedPeople} people`
                  : "Import iMessage history into local graph."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Button size="xs" onClick={runImport} disabled={busy || messagesStatus?.status !== "granted"}>
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
                  : "Resolve handles to real names."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={contactsStatus?.status === "granted" ? "success" : "default"}>
                {contactsStatus?.status || "unknown"}
              </Badge>
              {contactsStatus?.status !== "granted" ? (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={async () => {
                    const s = await window.openfolio.contacts.requestAccess();
                    setContactsStatus(s);
                  }}
                >
                  Allow
                </Button>
              ) : (
                <Button size="xs" onClick={syncContacts} disabled={busy}>
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
                <p className="settings-row-detail">Optional. Sign in for hosted AI, connectors, or billing.</p>
              </div>
              <div className="settings-row-actions">
                <Button variant="secondary" size="xs" onClick={startGoogleSignIn}>
                  Continue with Google
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-row">
              <div className="settings-row-info">
                <p className="settings-row-label">{cloudStatus?.accountEmail || currentUser?.email || "Signed in"}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(cloudStatus?.capabilities ?? []).map((c) => (
                    <Badge key={c} variant="info">{c}</Badge>
                  ))}
                  {!(cloudStatus?.capabilities ?? []).length && <Badge variant="secondary">local-only</Badge>}
                </div>
              </div>
              <div className="settings-row-actions">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    setCloudError(null);
                    try { await signOut(); setRegisteredUserId(null); }
                    catch (e) { setCloudError(e instanceof Error ? e.message : "Sign-out failed."); }
                  }}
                >
                  <LogOut size={12} />
                  Sign Out
                </Button>
              </div>
            </div>
          )}
          {cloudError && <p className="text-sm text-destructive mt-2">{cloudError}</p>}
        </div>

        {/* Integrations */}
        <div className="settings-group">
          <h3 className="settings-group-title">Integrations</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">MCP Server</p>
              <p className="settings-row-detail">Expose your graph to AI agents via Model Context Protocol.</p>
            </div>
            <div className="settings-row-actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div><Switch checked={mcpRunning} onCheckedChange={toggleMcp} /></div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {mcpRunning ? "Stop MCP server" : "Start MCP server"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Updates */}
        <div className="settings-group">
          <h3 className="settings-group-title">About</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">App Updates</p>
              <p className="settings-row-detail">
                {useAppStore.getState().updateState?.message || "Checks for updates via GitHub Releases."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={useAppStore.getState().updateState?.status === "downloaded" ? "success" : "secondary"}>
                {useAppStore.getState().updateState?.status || "idle"}
              </Badge>
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    const s = await window.openfolio.updates.checkNow();
                    useAppStore.getState().setUpdateState(s);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to check.");
                  }
                }}
              >
                Check
              </Button>
              {useAppStore.getState().updateState?.status === "downloaded" && (
                <Button
                  size="xs"
                  onClick={async () => {
                    try { await window.openfolio.updates.installNow(); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Install failed."); }
                  }}
                >
                  <Download size={12} />
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
