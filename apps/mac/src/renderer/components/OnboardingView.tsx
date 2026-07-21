import {
  ArrowLeft,
  Check,
  Database,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { MessagesImportJob } from "@openfolio/shared-types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getImportPrimaryAction, waitForImportJob } from "../import-jobs";
import { getOnboardingState } from "../onboarding";
import { useAppStore } from "../store";
import { Button } from "./ui/button";

function StepMarker({ current }: { current: 1 | 2 }) {
  return (
    <div className="onboarding-step-marker" aria-label={`Step ${current} of 2`}>
      <span className="active" />
      <span className={current === 2 ? "active" : ""} />
    </div>
  );
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="onboarding-panel onboarding-welcome">
      <div className="onboarding-brand">OpenFolio</div>
      <div className="onboarding-icon" aria-hidden="true">
        <Search />
      </div>
      <h1>Find anything from your iMessage history.</h1>
      <p className="onboarding-lede">
        Search by exact words or meaning, then open the original conversation
        to verify every result.
      </p>
      <div className="onboarding-promises" aria-label="Privacy guarantees">
        <div>
          <LockKeyhole aria-hidden="true" />
          <span><strong>Stays on this Mac</strong>Your messages and search index never leave your computer.</span>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" />
          <span><strong>Zero network requests</strong>Search and local AI run without connecting to the Internet.</span>
        </div>
      </div>
      <Button size="lg" onClick={onContinue}>Get started</Button>
    </section>
  );
}

function PermissionStep({
  busy,
  requested,
  onBack,
  onGrant,
  onCheck,
}: {
  busy: boolean;
  requested: boolean;
  onBack: () => void;
  onGrant: () => void;
  onCheck: () => void;
}) {
  return (
    <section className="onboarding-panel">
      <Button className="onboarding-back" size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back">
        <ArrowLeft />
      </Button>
      <StepMarker current={1} />
      <div className="onboarding-icon" aria-hidden="true">
        <ShieldCheck />
      </div>
      <h1>Allow read-only access to Messages.</h1>
      <p className="onboarding-lede">
        macOS protects your Messages database with Full Disk Access. OpenFolio
        needs permission to read it and build your private search index.
      </p>
      <div className="onboarding-assurance">
        <strong>What this permission does</strong>
        <p>OpenFolio can read messages already stored on this Mac. It cannot edit, delete, or send messages.</p>
        <p>Network Lock remains on. Message text, contacts, and embeddings are never uploaded or sent to an API.</p>
      </div>
      <div className="onboarding-actions">
        <Button size="lg" onClick={onGrant} disabled={busy}>
          {busy ? <RefreshCw className="animate-spin" /> : null}
          Open Full Disk Access
        </Button>
        {requested ? (
          <Button variant="ghost" onClick={onCheck} disabled={busy}>Check again</Button>
        ) : null}
      </div>
      <p className="onboarding-help">
        {requested
          ? "After enabling OpenFolio in System Settings, return here. Access is checked automatically."
          : "System Settings will open. OpenFolio will never ask for your Apple ID or Messages password."}
      </p>
    </section>
  );
}

function ImportStep({
  busy,
  importJob,
  onImport,
}: {
  busy: boolean;
  importJob: MessagesImportJob | null;
  onImport: () => void;
}) {
  const running = importJob?.status === "running" || importJob?.status === "cancelling";
  const failed = importJob?.status === "failed" || importJob?.status === "cancelled";

  return (
    <section className="onboarding-panel">
      <StepMarker current={2} />
      <div className="onboarding-icon" aria-hidden="true">
        <Database />
      </div>
      <h1>Build your private search.</h1>
      <p className="onboarding-lede">
        OpenFolio will copy searchable text into its own local, read-only index.
        Your Messages database is never changed.
      </p>
      <div className="onboarding-assurance">
        <strong>Everything happens locally</strong>
        <p>Exact search and semantic search use only software and a model bundled with OpenFolio.</p>
        <p>You can quit at any time. Your existing Messages library is unaffected.</p>
      </div>
      {running ? (
        <div className="onboarding-import-status" aria-live="polite">
          <RefreshCw className="animate-spin" aria-hidden="true" />
          <div>
            <strong>{importJob?.status === "cancelling" ? "Stopping import…" : "Indexing your messages…"}</strong>
            <span>
              {(importJob?.importedMessages ?? 0).toLocaleString()} messages · {(importJob?.importedThreads ?? 0).toLocaleString()} conversations
            </span>
          </div>
        </div>
      ) : null}
      {failed ? (
        <p className="onboarding-recovery" role="status">
          The import did not finish. Retry once. If it fails again, restart OpenFolio and recheck Messages access.
        </p>
      ) : null}
      <div className="onboarding-actions">
        <Button size="lg" onClick={onImport} disabled={busy || importJob?.status === "cancelling"}>
          {running ? "Cancel import" : failed ? "Retry indexing" : "Index my messages"}
        </Button>
      </div>
      <p className="onboarding-help">This can take a few minutes for a large message history.</p>
    </section>
  );
}

function ReadyStep({
  conversations,
  semanticRunning,
  onEnter,
}: {
  conversations: number;
  semanticRunning: boolean;
  onEnter: () => void;
}) {
  return (
    <section className="onboarding-panel onboarding-ready">
      <div className="onboarding-icon success" aria-hidden="true"><Check /></div>
      <h1>Your messages are searchable.</h1>
      <p className="onboarding-lede">
        {conversations > 0
          ? `${conversations.toLocaleString()} conversations are ready to search.`
          : "Your local index is ready. No conversations were found yet."}
      </p>
      <div className="onboarding-assurance">
        <strong>{semanticRunning ? "Semantic search is finishing locally" : "Private search is ready"}</strong>
        <p>{semanticRunning ? "You can start now. Meaning-based results will improve as local indexing finishes in the background." : "Search by words or meaning, and verify every result in its original conversation."}</p>
      </div>
      <Button size="lg" onClick={onEnter}>Open OpenFolio</Button>
    </section>
  );
}

export function OnboardingView() {
  const [permissionRequested, setPermissionRequested] = useState(false);
  const {
    messagesStatus,
    importJob,
    threads,
    busy,
    embeddingSync,
    setupDismissed,
    introSeen,
    setMessagesStatus,
    setImportJob,
    setThreads,
    setThreadSummaries,
    setEmbeddingSync,
    setBusy,
    setSetupDismissed,
    setIntroSeen,
  } = useAppStore();

  const state = getOnboardingState({
    messagesStatus,
    importJob,
    threadCount: threads.length,
    setupDismissed,
  });

  useEffect(() => {
    if (!introSeen || messagesStatus?.status === "granted") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void window.openfolio.messages.getAccessStatus().then(setMessagesStatus).catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, 1500);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [introSeen, messagesStatus?.status, setMessagesStatus]);

  useEffect(() => {
    if (!embeddingSync?.syncing) return;
    const interval = window.setInterval(() => {
      void window.openfolio.embeddings.getSyncStatus().then(setEmbeddingSync).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [embeddingSync?.syncing, setEmbeddingSync]);

  async function refreshAppData() {
    const [nextThreads, summaries] = await Promise.all([
      window.openfolio.threads.list({ limit: 50 }),
      window.openfolio.dashboard.getThreadSummaries(10),
    ]);
    setThreads(nextThreads);
    setThreadSummaries(summaries);
  }

  async function checkMessagesAccess(openSettings: boolean) {
    setBusy(true);
    try {
      setPermissionRequested(true);
      const status = openSettings
        ? await window.openfolio.messages.requestAccess()
        : await window.openfolio.messages.getAccessStatus();
      setMessagesStatus(status);
    } catch {
      toast.error("OpenFolio could not check Messages access. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const action = getImportPrimaryAction(importJob, messagesStatus?.status === "granted");
      if (action.kind === "cancel" && importJob) {
        const cancelled = await window.openfolio.messages.cancelImport(importJob.id);
        if (cancelled) setImportJob(cancelled);
        return;
      }

      const job = action.kind === "retry"
        ? await window.openfolio.messages.retryImport(importJob?.id)
        : await window.openfolio.messages.startImport();
      setImportJob(job);
      const isRunning = job.status === "running" || job.status === "cancelling";
      if (isRunning) setBusy(false);
      const finalJob = isRunning ? await waitForImportJob(job.id, setImportJob) : job;

      if (!finalJob || finalJob.status !== "completed") return;
      await refreshAppData();
      try {
        const semanticStatus = await window.openfolio.embeddings.syncNow();
        setEmbeddingSync(semanticStatus);
      } catch {
        toast("Messages are ready. Semantic indexing can be retried from Settings.");
      }
    } catch {
      toast.error("Message indexing did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const showWelcome = !introSeen && !state.canEnterApp;

  return (
    <main className="onboarding-shell">
      {showWelcome ? (
        <Welcome onContinue={() => setIntroSeen(true)} />
      ) : state.stage === "messages" ? (
        <PermissionStep
          busy={busy}
          requested={permissionRequested}
          onBack={() => setIntroSeen(false)}
          onGrant={() => void checkMessagesAccess(true)}
          onCheck={() => void checkMessagesAccess(false)}
        />
      ) : state.stage === "import" ? (
        <ImportStep busy={busy} importJob={importJob} onImport={() => void runImport()} />
      ) : (
        <ReadyStep
          conversations={threads.length || importJob?.importedThreads || 0}
          semanticRunning={Boolean(embeddingSync?.syncing || embeddingSync?.dirtyDocuments)}
          onEnter={() => setSetupDismissed(true)}
        />
      )}
    </main>
  );
}
