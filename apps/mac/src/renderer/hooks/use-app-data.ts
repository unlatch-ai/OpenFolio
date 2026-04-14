import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { toast } from "sonner";

/**
 * Bootstraps app data on mount: messages status, contacts, MCP, threads, suggestions, watcher.
 * Also sets up the sync-complete and update-state listeners.
 */
export function useAppData() {
  const {
    setMessagesStatus,
    setContactsStatus,
    setMcpRunning,
    setThreads,
    setThreadSummaries,
    setSuggestions,
    setUpdateState,
    setWatcherState,
    setInitialized,
  } = useAppStore();

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function bootstrap() {
      try {
        const [messagesStatus, contactsStatus, mcpStatus, threads, summaries, suggestions, watcherState] =
          await Promise.all([
            window.openfolio.messages.getAccessStatus(),
            window.openfolio.contacts.getAccessStatus(),
            window.openfolio.mcp.getStatus(),
            window.openfolio.threads.list({ limit: 50 }),
            window.openfolio.dashboard.getThreadSummaries(10),
            window.openfolio.dashboard.getReminderSuggestions(10),
            window.openfolio.sync.getWatcherState(),
          ]);

        setMessagesStatus(messagesStatus);
        setContactsStatus(contactsStatus);
        setMcpRunning(mcpStatus.running);
        setThreads(threads);
        setThreadSummaries(summaries);
        setSuggestions(suggestions);
        setWatcherState(watcherState);

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
    setMcpRunning,
    setThreads,
    setThreadSummaries,
    setSuggestions,
    setUpdateState,
    setWatcherState,
    setInitialized,
  ]);

  // Update state listener
  useEffect(() => {
    window.openfolio.updates
      .getState()
      .then(setUpdateState)
      .catch(console.error);

    return window.openfolio.updates.onStateChange(setUpdateState);
  }, [setUpdateState]);

  // Sync complete listener — refresh threads on new import
  useEffect(() => {
    return window.openfolio.sync.onSyncComplete((job) => {
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
  }, [setThreads, setThreadSummaries]);
}
