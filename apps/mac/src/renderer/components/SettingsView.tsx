import { useEffect, useState } from "react";
import { Copy, FolderOpen, RefreshCw } from "lucide-react";
import type {
  LocalDataStatus,
  McpSetupStatus,
  MessagesAccessStatus,
  SearchScaleStatus,
} from "@openfolio/shared-types";
import { toast } from "sonner";
import { useAppStore } from "../store";
import { formatDiagnosticsReport } from "../diagnostics";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const RELEASE_ADDRESS =
  "https://github.com/unlatch-ai/OpenFolio/releases/latest";

function messagesAccessCopy(status: MessagesAccessStatus | null) {
  if (!status) return "Checking read-only Messages access…";
  if (status.status === "granted") {
    return "OpenFolio can read the Messages database on this Mac. It cannot send, edit, or delete messages.";
  }
  return "Messages access is off. OpenFolio cannot read or index conversations until Full Disk Access is enabled.";
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  detail,
  children,
  mono = false,
}: {
  title: string;
  detail: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="settings-row">
      <div>
        <h3>{title}</h3>
        <div className={mono ? "mono-detail" : undefined}>{detail}</div>
      </div>
      {children && <div className="settings-actions">{children}</div>}
    </div>
  );
}

export function SettingsView() {
  const {
    messagesStatus,
    contactsStatus,
    contactsSync,
    importJob,
    embeddingSync,
    updateState,
    setMessagesStatus,
    setContactsStatus,
    setContactsSync,
    setImportJob,
    setEmbeddingSync,
    setBusy,
    busy,
  } = useAppStore();
  const [localData, setLocalData] = useState<LocalDataStatus | null>(null);
  const [scale, setScale] = useState<SearchScaleStatus | null>(null);
  const [mcp, setMcp] = useState<McpSetupStatus | null>(null);
  const [mcpAcknowledged, setMcpAcknowledged] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [statusRequest, setStatusRequest] = useState(0);

  useEffect(() => {
    setStatusError(false);
    void Promise.all([
      window.openfolio.localData.getStatus(),
      window.openfolio.search.getScaleStatus(),
      window.openfolio.mcp.getSetup(),
    ])
      .then(([data, status, setup]) => {
        setLocalData(data);
        setScale(status);
        setMcp(setup);
      })
      .catch(() => setStatusError(true));
  }, [statusRequest]);

  const importMessages = async () => {
    setBusy(true);
    try {
      const job =
        importJob?.status === "failed"
          ? await window.openfolio.messages.retryImport(importJob.id)
          : await window.openfolio.messages.startImport();
      setImportJob(job);
      toast("Local import started");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Import could not start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const syncContacts = async () => {
    setBusy(true);
    try {
      let status = contactsStatus;
      if (status?.status !== "granted") {
        status = await window.openfolio.contacts.requestAccess();
        setContactsStatus(status);
      }
      if (status.status === "granted") {
        const summary = await window.openfolio.contacts.sync();
        setContactsSync(summary);
        toast.success("Contacts matched locally");
      }
    } catch {
      toast.error("Contacts could not be synced. Your message library is unchanged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="settings-view">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="page-description">Privacy, sources, and local search</p>
      </header>
      <div className="settings-content">
        {statusError && (
          <div className="settings-status-error" role="status">
            <span>
              Some local status could not be read. The controls below are still
              safe to use.
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStatusRequest((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        )}
        <SettingsSection title="Privacy and local data">
          <SettingsRow
            title="Local message library"
            detail={
              <p>
                OpenFolio reads the iMessage database already stored on this Mac
                and builds a separate local search index. The app does not
                contact OpenFolio, OpenAI, GitHub, or any other service. It does
                not send, edit, delete, or back up your messages.
              </p>
            }
          >
            <Badge variant="secondary">On this Mac</Badge>
          </SettingsRow>
          <SettingsRow
            title="Network"
            detail={
              <p>
                No app connections. OpenFolio does not open network URLs or make
                Internet, LAN, loopback, or DNS requests.
              </p>
            }
          >
            <Badge variant="success">No connections</Badge>
          </SettingsRow>
          <SettingsRow
            title="OpenFolio database"
            mono
            detail={
              <>
                <p>{localData?.databasePath || "Checking local database…"}</p>
                <p>
                  {localData
                    ? `${localData.backupCount} migration backup${localData.backupCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </>
            }
          >
            <Button
              variant="secondary"
              onClick={() => void window.openfolio.localData.revealDatabase()}
            >
              <FolderOpen data-icon="inline-start" />
              Reveal
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Sources">
          <SettingsRow
            title="Messages"
            detail={<p>{messagesAccessCopy(messagesStatus)}</p>}
          >
            <Badge
              variant={
                messagesStatus?.status === "granted" ? "success" : "secondary"
              }
            >
              {messagesStatus?.status === "granted"
                ? "Read-only · Granted"
                : "Needs access"}
            </Badge>
            <Button
              variant="secondary"
              onClick={async () =>
                setMessagesStatus(
                  await window.openfolio.messages.requestAccess(),
                )
              }
            >
              {messagesStatus?.status === "granted"
                ? "Recheck"
                : "Allow access"}
            </Button>
          </SettingsRow>
          <SettingsRow
            title="Messages import"
            detail={
              <p>
                {importJob
                  ? `${importJob.importedMessages.toLocaleString()} messages and ${importJob.importedThreads.toLocaleString()} conversations processed`
                  : "Build or refresh the local message library."}
              </p>
            }
          >
            <Button
              onClick={() => void importMessages()}
              disabled={busy || messagesStatus?.status !== "granted"}
            >
              <RefreshCw data-icon="inline-start" />
              {importJob?.status === "failed" ? "Retry import" : "Import now"}
            </Button>
          </SettingsRow>
          <SettingsRow
            title="Apple Contacts"
            detail={
              <p>
                Apple Contacts is optional. If enabled, OpenFolio uses it
                locally to match handles to names.
                {contactsSync
                  ? ` ${contactsSync.importedContacts.toLocaleString()} contacts were read in the last sync.`
                  : ""}
              </p>
            }
          >
            <Badge
              variant={
                contactsStatus?.status === "granted" ? "success" : "secondary"
              }
            >
              {contactsStatus?.status === "granted" ? "Granted" : "Optional"}
            </Badge>
            <Button
              variant="secondary"
              onClick={() => void syncContacts()}
              disabled={busy}
            >
              Sync locally
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Search index">
          <SettingsRow
            title="Exact search"
            detail={
              <p>
                {scale
                  ? `${scale.totalDocuments.toLocaleString()} local records are searchable.`
                  : "Checking local index…"}
              </p>
            }
          >
            <Badge variant="success">Ready</Badge>
          </SettingsRow>
          <SettingsRow
            title="Meaning-based search"
            detail={
              <p>
                Meaning-based search runs with a model included in the app.
                Search text and message text never leave this Mac.
              </p>
            }
          >
            <Badge
              variant={
                !embeddingSync || embeddingSync.lastError
                  ? "secondary"
                  : embeddingSync.dirtyDocuments
                    ? "secondary"
                    : "success"
              }
            >
              {!embeddingSync
                ? "Checking"
                : embeddingSync.lastError
                ? "Unavailable"
                : embeddingSync.dirtyDocuments
                  ? "Partial"
                  : "Ready"}
            </Badge>
            <Button
              variant="secondary"
              onClick={() =>
                void window.openfolio.embeddings
                  .getSyncStatus()
                  .then(setEmbeddingSync)
              }
            >
              Refresh
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Advanced">
          <details className="advanced-disclosure">
            <summary>Diagnostics and local integrations</summary>
            <SettingsRow
              title="Diagnostics"
              detail={
                <p>
                  Copies app, permission, index, and sync status. Message and
                  contact contents are excluded.
                </p>
              }
            >
              <Button
                variant="secondary"
                onClick={async () => {
                  const report = await window.openfolio.diagnostics.getReport();
                  await navigator.clipboard.writeText(
                    formatDiagnosticsReport(report),
                  );
                  toast.success("Diagnostics copied");
                }}
              >
                <Copy data-icon="inline-start" />
                Copy diagnostics
              </Button>
            </SettingsRow>
            {mcp?.available && (
              <div className="mcp-disclosure">
                <h3>MCP setup</h3>
                <p>
                  OpenFolio&apos;s MCP server reads your local library and
                  returns matching names, messages, notes, and relationship data
                  to the MCP client you configure. OpenFolio uses local stdio
                  and makes no network requests. The client may send tool
                  requests or results to its own cloud service. Review that
                  client&apos;s privacy and retention settings before enabling
                  it.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={mcpAcknowledged}
                    onChange={(event) =>
                      setMcpAcknowledged(event.target.checked)
                    }
                  />{" "}
                  I understand the external client receives private results.
                </label>
                {mcp.clients.map((client) => (
                  <div className="mcp-client" key={client.id}>
                    <strong>{client.name}</strong>
                    <Button
                      variant="secondary"
                      disabled={!mcpAcknowledged}
                      onClick={async () => {
                        await navigator.clipboard.writeText(client.config);
                        toast.success(`${client.name} configuration copied`);
                      }}
                    >
                      <Copy data-icon="inline-start" />
                      Copy configuration
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </details>
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow
            title="Version"
            mono
            detail={<p>OpenFolio {updateState?.currentVersion || "current version"}</p>}
          />
          <SettingsRow
            title="Manual updates"
            detail={
              <p>
                OpenFolio does not check for updates or connect to the Internet.
                To update, quit OpenFolio, independently open a browser, go to
                the release address shown below, download the signed release,
                and replace OpenFolio.app in Applications. Your library in
                Application Support remains in place.
              </p>
            }
          />
          <SettingsRow
            title="Release address"
            mono
            detail={<p className="selectable-address">{RELEASE_ADDRESS}</p>}
          >
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(RELEASE_ADDRESS);
                toast.success("Release address copied");
              }}
            >
              <Copy data-icon="inline-start" />
              Copy address
            </Button>
          </SettingsRow>
        </SettingsSection>
      </div>
    </main>
  );
}
