import { useCallback, useEffect, useState } from "react";
import type { AiSettingsStatus, EmbeddingSyncStatus, LocalDataStatus, McpSettingsStatus, McpSetupStatus, SearchScaleStatus } from "@openfolio/shared-types";
import { Copy, Download, ExternalLink, FolderOpen, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { useTheme } from "@/lib/use-theme";
import { useAppStore } from "../store";
import { formatDiagnosticsReport } from "../diagnostics";
import { getImportPrimaryAction, waitForImportJob } from "../import-jobs";
import { getBackupSummaryLabel, getPathLabel } from "../local-data-labels";
import { describeSearchScale } from "../search-results";
import { getAppVersionLabel, getLastCheckedLabel, getReleaseNotesUrl, getUpdateStatusLabel, getUpdateVersionLabel } from "../update-labels";

export function SettingsView() {
  const { theme, setTheme } = useTheme();

  const {
    messagesStatus,
    contactsStatus,
    contactsSync,
    updateState,
    importJob,
    busy,
    cloudError,
    setMessagesStatus,
    setContactsStatus,
    setContactsSync,
    setImportJob,
    setUpdateState,
    setBusy,
    setThreads,
    setSetupDismissed,
  } = useAppStore();

  const [aiSettings, setAiSettings] = useState<AiSettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [useOpenAIEmbeddings, setUseOpenAIEmbeddings] = useState(false);
  const [mcpSettings, setMcpSettings] = useState<McpSettingsStatus | null>(null);
  const [mcpSetup, setMcpSetup] = useState<McpSetupStatus | null>(null);
  const [embeddingSync, setEmbeddingSync] = useState<EmbeddingSyncStatus | null>(null);
  const [searchScale, setSearchScale] = useState<SearchScaleStatus | null>(null);
  const [localData, setLocalData] = useState<LocalDataStatus | null>(null);

  useEffect(() => {
    void window.openfolio.ai.getSettings().then((settings) => {
      setAiSettings(settings);
      setUseOpenAIEmbeddings(settings.useOpenAIEmbeddings);
    });
    void window.openfolio.mcp.getSettings().then(setMcpSettings);
    void window.openfolio.mcp.getSetup().then(setMcpSetup);
    void window.openfolio.embeddings.getSyncStatus().then(setEmbeddingSync);
    void window.openfolio.search.getScaleStatus().then(setSearchScale);
    void window.openfolio.localData.getStatus().then(setLocalData);
  }, []);

  const runImport = useCallback(async () => {
    setBusy(true);
    try {
      const action = getImportPrimaryAction(importJob, messagesStatus?.status === "granted");
      if (action.kind === "cancel" && importJob) {
        const cancelled = await window.openfolio.messages.cancelImport(importJob.id);
        if (cancelled) setImportJob(cancelled);
        toast("Import cancellation requested");
        return;
      }

      const job = action.kind === "retry"
        ? await window.openfolio.messages.retryImport(importJob?.id)
        : await window.openfolio.messages.startImport();
      setImportJob(job);
      const isRunning = job.status === "running" || job.status === "cancelling";
      if (isRunning) {
        setBusy(false);
      }
      const finalJob = isRunning ? await waitForImportJob(job.id, setImportJob) : job;
      if (!finalJob) {
        toast.error("Import status was lost.");
      } else if (finalJob.status === "completed") {
        toast.success(`Imported ${finalJob.importedMessages} messages`);
        const threads = await window.openfolio.threads.list({ limit: 50 });
        setThreads(threads);
        await window.openfolio.search.getScaleStatus().then(setSearchScale);
      } else if (finalJob.status === "cancelled") {
        toast("Import cancelled");
      } else {
        toast.error(finalJob.error || "Import failed.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }, [importJob, messagesStatus?.status, setBusy, setImportJob, setThreads]);

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

  const requestContactsAndSync = useCallback(async () => {
    setBusy(true);
    try {
      const status = await window.openfolio.contacts.requestAccess();
      setContactsStatus(status);

      if (status.status !== "granted") {
        toast.error(status.details || "Contacts access was not granted.");
        return;
      }

      const summary = await window.openfolio.contacts.sync();
      setContactsSync(summary);
      toast.success(`Synced ${summary.importedContacts} contacts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Contacts sync failed.");
    } finally {
      setBusy(false);
    }
  }, [setBusy, setContactsStatus, setContactsSync]);

  const saveAiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("Enter an OpenAI API key first.");
      return;
    }
    try {
      const settings = await window.openfolio.ai.saveOpenAIKey({
        apiKey: apiKey.trim(),
        useOpenAIEmbeddings,
      });
      setAiSettings(settings);
      setApiKey("");
      toast.success("OpenAI key saved locally");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save key.");
    }
  }, [apiKey, useOpenAIEmbeddings]);

  const setMcpEnabled = useCallback(async (enabled: boolean) => {
    try {
      const settings = await window.openfolio.mcp.setEnabled({ enabled });
      setMcpSettings(settings);
      const setup = await window.openfolio.mcp.getSetup();
      setMcpSetup(setup);
      toast.success(enabled ? "MCP is on" : "MCP is off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update MCP.");
    }
  }, []);

  const importAction = getImportPrimaryAction(importJob, messagesStatus?.status === "granted");

  return (
    <div className="settings-view">
      <div className="settings-inner">
        {/* Setup */}
        <div className="settings-group">
          <h3 className="settings-group-title">Setup</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Onboarding status</p>
              <p className="settings-row-detail">Review Messages access, import progress, Contacts, and semantic indexing.</p>
            </div>
            <div className="settings-row-actions">
              <Button variant="secondary" size="xs" onClick={() => setSetupDismissed(false)}>
                Review setup
              </Button>
            </div>
          </div>
        </div>

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
                <RefreshCw size={12} className={importJob?.status === "running" || importJob?.status === "cancelling" ? "animate-spin" : ""} />
                {importAction.label}
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
                  onClick={requestContactsAndSync}
                  disabled={busy}
                >
                  Allow & Sync
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
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Hosted account</p>
              <p className="settings-row-detail">Deferred. The Mac app currently runs local-first without account sign-in or hosted AI.</p>
            </div>
            <div className="settings-row-actions">
              <Badge variant="secondary">future</Badge>
            </div>
          </div>
          {cloudError && <p className="text-sm text-destructive mt-2">{cloudError}</p>}
        </div>

        {/* AI */}
        <div className="settings-group">
          <h3 className="settings-group-title">AI</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Bring your own OpenAI key</p>
              <p className="settings-row-detail">
                {aiSettings?.hasOpenAIKey
                  ? "OpenAI answers are enabled. Your key is stored locally on this Mac."
                  : "Optional. Enables Ask mode without an OpenFolio hosted plan."}
              </p>
            </div>
            <div className="settings-row-actions settings-key-actions">
              <input
                className="settings-key-input"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
                type="password"
              />
              <Button size="xs" onClick={saveAiKey}>
                <KeyRound size={12} />
                Save
              </Button>
              {aiSettings?.hasOpenAIKey && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    const settings = await window.openfolio.ai.deleteOpenAIKey();
                    setAiSettings(settings);
                    toast("OpenAI key removed");
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Use OpenAI embeddings</p>
              <p className="settings-row-detail">Off keeps semantic indexing local with Transformers.js. On uses your OpenAI key for embeddings.</p>
            </div>
            <div className="settings-row-actions">
              <Switch checked={useOpenAIEmbeddings} onCheckedChange={setUseOpenAIEmbeddings} />
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Embedding index</p>
              <p className="settings-row-detail">
                {embeddingSync
                  ? `${embeddingSync.embeddedDocuments}/${embeddingSync.totalDocuments} documents embedded, ${embeddingSync.dirtyDocuments} pending${embeddingSync.syncing ? ", indexing now" : ""}`
                  : "Checking local search index..."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void window.openfolio.embeddings.getSyncStatus().then(setEmbeddingSync)}
              >
                Refresh
              </Button>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Search scale</p>
              <p className="settings-row-detail">
                {searchScale
                  ? describeSearchScale(searchScale)
                  : "Checking search scale..."}
              </p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={searchScale?.recommendVectorIndex ? "default" : "secondary"}>
                {searchScale?.recommendVectorIndex ? "benchmark" : "ok"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="settings-group">
          <h3 className="settings-group-title">Integrations</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">MCP access</p>
              <p className="settings-row-detail">
                Local AI apps can ask OpenFolio to search your local relationship graph. Raw Messages stay on this Mac; turn this on only when you want those clients to use OpenFolio.
              </p>
              <p className="settings-row-detail">{mcpSetup?.details || "Loading local MCP setup..."}</p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={mcpSettings?.enabled ? "success" : "secondary"}>{mcpSettings?.enabled ? "on" : "off"}</Badge>
              <Switch checked={Boolean(mcpSettings?.enabled)} onCheckedChange={setMcpEnabled} />
            </div>
          </div>
          {mcpSettings?.enabled && mcpSetup?.clients.map((client) => (
            <div className="settings-row settings-code-row" key={client.id}>
              <div className="settings-row-info">
                <p className="settings-row-label">{client.name}</p>
                <pre className="settings-code-block">{client.config}</pre>
              </div>
              <div className="settings-row-actions">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(client.config);
                    toast("Copied MCP config");
                  }}
                >
                  <Copy size={12} />
                  Copy
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Updates */}
        <div className="settings-group">
          <h3 className="settings-group-title">About</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Version</p>
              <p className="settings-row-detail">{getAppVersionLabel(updateState)}</p>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">App Updates</p>
              <p className="settings-row-detail">
                {updateState?.message || "Checks GitHub Releases for signed OpenFolio updates."}
              </p>
              <p className="settings-row-detail">{getUpdateVersionLabel(updateState)}</p>
              <p className="settings-row-detail">{getLastCheckedLabel(updateState)}</p>
            </div>
            <div className="settings-row-actions">
              <Badge variant={updateState?.status === "downloaded" ? "success" : "secondary"}>
                {getUpdateStatusLabel(updateState)}
              </Badge>
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    const s = await window.openfolio.updates.checkNow();
                    setUpdateState(s);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to check.");
                  }
                }}
              >
                Check
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    await window.openfolio.cloud.openExternal(getReleaseNotesUrl(updateState));
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not open release notes.");
                  }
                }}
              >
                <ExternalLink size={12} />
                Notes
              </Button>
              {updateState?.status === "downloaded" && (
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
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Diagnostics</p>
              <p className="settings-row-detail">Copy a local support report with app, permission, update, and sync status. It does not include message or contact contents.</p>
            </div>
            <div className="settings-row-actions">
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    const report = await window.openfolio.diagnostics.getReport();
                    await navigator.clipboard.writeText(formatDiagnosticsReport(report));
                    toast.success("Diagnostics copied");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not copy diagnostics.");
                  }
                }}
              >
                <Copy size={12} />
                Copy
              </Button>
            </div>
          </div>
        </div>

        {/* Local Data */}
        <div className="settings-group">
          <h3 className="settings-group-title">Local Data</h3>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Database</p>
              <p className="settings-row-detail">{getPathLabel(localData?.databasePath)}</p>
            </div>
            <div className="settings-row-actions">
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    await window.openfolio.localData.revealDatabase();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not reveal database.");
                  }
                }}
              >
                <FolderOpen size={12} />
                Reveal
              </Button>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-info">
              <p className="settings-row-label">Migration Backups</p>
              <p className="settings-row-detail">{getBackupSummaryLabel(localData)}</p>
              <p className="settings-row-detail">{getPathLabel(localData?.backupDirectoryPath)}</p>
            </div>
            <div className="settings-row-actions">
              <Button
                variant="secondary"
                size="xs"
                onClick={async () => {
                  try {
                    await window.openfolio.localData.revealBackups();
                    const status = await window.openfolio.localData.getStatus();
                    setLocalData(status);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not reveal backups.");
                  }
                }}
              >
                <FolderOpen size={12} />
                Reveal
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
