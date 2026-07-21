import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { toast } from "sonner";

/**
 * Bootstraps app data on mount: messages status, contacts, MCP, threads, suggestions, watcher.
 * Also sets up the sync-complete and update-state listeners.
 */
export function useAppData() {
  const requestedPreview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("onboarding-preview")
    : null;
  const onboardingPreview = requestedPreview === "import" || requestedPreview === "ready"
    ? requestedPreview
    : null;
  const {
    setMessagesStatus,
    setContactsStatus,
    setMcpStatus,
    setEmbeddingSync,
    setThreads,
    setThreadSummaries,
    setImportJob,
    setUpdateState,
    setWatcherState,
    setInitialized,
    setIntroSeen,
    setSetupDismissed,
  } = useAppStore();

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (onboardingPreview === "import" || onboardingPreview === "ready") {
      setIntroSeen(true);
      setSetupDismissed(false);
      setMessagesStatus({
        status: "granted",
        chatDbPath: "/Users/you/Library/Messages/chat.db",
        details: "Messages access granted.",
      });
      setImportJob(
        onboardingPreview === "ready"
          ? {
              id: "preview-complete",
              status: "completed",
              importedMessages: 28416,
              importedPeople: 184,
              importedThreads: 327,
              lastCursor: 28416,
              error: null,
              startedAt: 1,
              completedAt: 2,
            }
          : {
              id: "preview-running",
              status: "running",
              importedMessages: 12482,
              importedPeople: 96,
              importedThreads: 148,
              lastCursor: 12482,
              error: null,
              startedAt: 1,
              completedAt: null,
            },
      );
      setEmbeddingSync({
        totalDocuments: onboardingPreview === "ready" ? 28743 : 0,
        embeddedDocuments: onboardingPreview === "ready" ? 28743 : 0,
        dirtyDocuments: 0,
        provider: onboardingPreview === "ready" ? "local" : null,
        model: onboardingPreview === "ready" ? "all-MiniLM-L6-v2" : null,
        syncing: false,
        lastError: null,
      });
      setInitialized(true);
      return;
    }

    async function bootstrap() {
      try {
        const [messagesStatus, contactsStatus, mcpStatus, threads, summaries, watcherState, embeddingSync, activeImport] =
          await Promise.all([
            window.openfolio.messages.getAccessStatus(),
            window.openfolio.contacts.getAccessStatus(),
            window.openfolio.mcp.getStatus(),
            window.openfolio.threads.list({ limit: 50 }),
            window.openfolio.dashboard.getThreadSummaries(10),
            window.openfolio.sync.getWatcherState(),
            window.openfolio.embeddings.getSyncStatus(),
            window.openfolio.messages.getActiveImport(),
          ]);

        setMessagesStatus(messagesStatus);
        setContactsStatus(contactsStatus);
        setMcpStatus(mcpStatus);
        setThreads(threads);
        setThreadSummaries(summaries);
        setWatcherState(watcherState);
        setEmbeddingSync(embeddingSync);
        setImportJob(activeImport);

        // Auto-start watcher if messages access is granted
        if (messagesStatus.status === "granted" && !watcherState.watching) {
          const started = await window.openfolio.sync.startWatcher();
          setWatcherState(started);
        }
      } catch (error) {
        console.error("[openfolio] Bootstrap failed:", error);
      } finally {
        setInitialized(true);
      }
    }

    void bootstrap();
  }, [
    setMessagesStatus,
    setContactsStatus,
    setMcpStatus,
    setEmbeddingSync,
    setThreads,
    setThreadSummaries,
    setImportJob,
    setUpdateState,
    setWatcherState,
    setInitialized,
    setIntroSeen,
    setSetupDismissed,
    onboardingPreview,
  ]);

  // Update state listener
  useEffect(() => {
    if (onboardingPreview) return;
    window.openfolio.updates
      .getState()
      .then(setUpdateState)
      .catch(console.error);

    return window.openfolio.updates.onStateChange(setUpdateState);
  }, [onboardingPreview, setUpdateState]);

  // Sync complete listener — refresh threads on new import
  useEffect(() => {
    if (onboardingPreview) return;
    return window.openfolio.sync.onSyncComplete((job) => {
      setImportJob(job);
      if (job.status === "completed" && job.importedMessages > 0) {
        toast.success(`Synced ${job.importedMessages} new messages`);
        // Refresh thread list
        window.openfolio.threads
          .list({ limit: 50 })
          .then(setThreads)
          .catch(console.error);
        window.openfolio.dashboard
          .getThreadSummaries(10)
          .then(setThreadSummaries)
          .catch(console.error);
      }
    });
  }, [onboardingPreview, setImportJob, setThreads, setThreadSummaries]);
}
