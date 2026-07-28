import { Check, Database, KeyRound, MessageSquare, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useAppStore } from "../store";
import { getOnboardingState, type OnboardingStep } from "../onboarding";
import { getImportPrimaryAction, waitForImportJob } from "../import-jobs";

const STEP_ICONS: Record<OnboardingStep["id"], typeof MessageSquare> = {
  messages: ShieldCheck,
  import: Database,
  contacts: Users,
  embeddings: Search,
};

function StepIcon({ step }: { step: OnboardingStep }) {
  const Icon = STEP_ICONS[step.id];
  if (step.status === "complete") {
    return <Check size={16} />;
  }
  if (step.status === "running") {
    return <RefreshCw size={16} className="animate-spin" />;
  }
  return <Icon size={16} />;
}

function StepRow({ step, active, onAction, busy }: { step: OnboardingStep; active: boolean; onAction: () => void; busy: boolean }) {
  const showAction = step.actionLabel && step.status !== "waiting" && (step.status !== "blocked" || step.id === "contacts");

  return (
    <div className={`setup-step ${active ? "active" : ""} ${step.status}`}>
      <div className="setup-step-icon">
        <StepIcon step={step} />
      </div>
      <div className="setup-step-copy">
        <div className="setup-step-title-row">
          <h3>{step.title}</h3>
          {!step.required && <Badge variant="secondary">recommended</Badge>}
        </div>
        <p>{step.description}</p>
      </div>
      {showAction && (
        <Button size="xs" variant={step.status === "complete" ? "secondary" : "default"} onClick={onAction} disabled={busy}>
          {step.status === "running" ? <RefreshCw size={12} className="animate-spin" /> : null}
          {step.actionLabel}
        </Button>
      )}
    </div>
  );
}

export function OnboardingView() {
  const monitoredImportId = useRef<string | null>(null);
  const {
    messagesStatus,
    contactsStatus,
    contactsSync,
    importJob,
    threads,
    busy,
    embeddingSync,
    setupDismissed,
    setMessagesStatus,
    setContactsStatus,
    setContactsSync,
    setImportJob,
    setThreads,
    setThreadSummaries,
    setEmbeddingSync,
    setBusy,
    setSetupDismissed,
    setView,
  } = useAppStore();

  const state = getOnboardingState({
    messagesStatus,
    contactsStatus,
    contactsSync,
    importJob,
    threadCount: threads.length,
    embeddingSync,
    setupDismissed,
  });

  useEffect(() => {
    if (!embeddingSync?.syncing) return;
    const interval = window.setInterval(() => {
      void window.openfolio.embeddings.getSyncStatus().then(setEmbeddingSync).catch(console.error);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [embeddingSync?.syncing, setEmbeddingSync]);

  useEffect(() => {
    if (!importJob || (importJob.status !== "running" && importJob.status !== "cancelling")) return;
    if (monitoredImportId.current === importJob.id) return;
    monitoredImportId.current = importJob.id;
    void finishImport(importJob.id).finally(() => {
      monitoredImportId.current = null;
    });
  }, [importJob?.id, importJob?.status]);

  async function refreshAppData() {
    const [nextThreads, summaries, nextEmbeddingSync] = await Promise.all([
      window.openfolio.threads.list({ limit: 50 }),
      window.openfolio.dashboard.getThreadSummaries(10),
      window.openfolio.embeddings.getSyncStatus(),
    ]);
    setThreads(nextThreads);
    setThreadSummaries(summaries);
    setEmbeddingSync(nextEmbeddingSync);
  }

  async function finishImport(jobId: string) {
    const finalJob = await waitForImportJob(jobId, setImportJob);

    if (!finalJob) {
      toast.error("Import status was lost.");
      return;
    }

    if (finalJob.status === "cancelled") {
      toast("Import cancelled");
      return;
    }

    if (finalJob.status !== "completed") {
      toast.error(finalJob.error || "Messages import failed.");
      return;
    }

    toast.success(`Imported ${finalJob.importedMessages} messages`);
    await refreshAppData();
  }

  async function runMessagesAccess() {
    setBusy(true);
    try {
      const status = await window.openfolio.messages.requestAccess();
      setMessagesStatus(status);
      if (status.status === "granted") {
        toast.success("Messages access is ready");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check Messages access.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const action = getImportPrimaryAction(importJob, messagesStatus?.status === "granted");
      if ((action.kind === "cancel") && importJob) {
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
        toast("Messages import started. You can continue setup while it runs.");
        monitoredImportId.current = job.id;
        void finishImport(job.id).catch((error) => {
          toast.error(error instanceof Error ? error.message : "Messages import failed.");
        }).finally(() => {
          monitoredImportId.current = null;
        });
        return;
      }
      await finishImport(job.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Messages import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runContacts() {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Contacts sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runEmbeddings() {
    setBusy(true);
    try {
      const status = await window.openfolio.embeddings.syncNow();
      setEmbeddingSync(status);
      toast.success(status.syncing ? "Semantic indexing started" : "Semantic index is up to date");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Semantic index failed.");
    } finally {
      setBusy(false);
    }
  }

  const actionByStep: Record<OnboardingStep["id"], () => void> = {
    messages: () => void runMessagesAccess(),
    import: () => void runImport(),
    contacts: () => void runContacts(),
    embeddings: () => void runEmbeddings(),
  };

  return (
    <div className="setup-shell">
      <div className="setup-main">
        <div className="setup-hero">
          <Badge variant="secondary">Local-first setup</Badge>
          <h1>Set up OpenFolio</h1>
          <p>
            Start with local Messages access and import. Contacts and semantic indexing can run after import starts,
            and hosted features stay optional.
          </p>
          <div className="setup-hero-actions">
            {state.canEnterApp && (
              <Button
                size="sm"
                onClick={() => {
                  setView("inbox");
                  setSetupDismissed(true);
                }}
              >
                Open dashboard
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void window.openfolio.cloud.openExternal("https://openfolio.ai/docs/privacy")}
            >
              <KeyRound size={14} />
              Privacy details
            </Button>
          </div>
        </div>

        <div className="setup-progress">
          <div className="setup-progress-header">
            <span>{state.progress.completedRequired}/{state.progress.totalRequired} required steps complete</span>
            {state.canEnterApp ? <Badge variant="success">ready</Badge> : <Badge variant="default">setup needed</Badge>}
          </div>
          <div className="setup-steps">
            {state.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                active={state.activeStepId === step.id}
                busy={busy}
                onAction={actionByStep[step.id]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
