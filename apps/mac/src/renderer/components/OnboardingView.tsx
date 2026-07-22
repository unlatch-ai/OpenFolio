import {
  ArrowLeft,
  Check,
  ContactRound,
  Database,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type {
  ContactsAccessStatus,
  ContactsSyncSummary,
  EmbeddingPlanStats,
  EmbeddingPriority,
  MessagesImportJob,
} from "@openfolio/shared-types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getImportPrimaryAction, waitForImportJob } from "../import-jobs";
import { getOnboardingState } from "../onboarding";
import { useAppStore } from "../store";
import { Button } from "./ui/button";

function StepMarker({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="onboarding-step-marker" aria-label={`Step ${current} of 4`}>
      {[1, 2, 3, 4].map((step) => <span key={step} className={current >= step ? "active" : ""} />)}
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
  accessTargetLabel,
  onBack,
  onGrant,
  onCheck,
}: {
  busy: boolean;
  requested: boolean;
  accessTargetLabel: string;
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
          ? `Finder highlighted ${accessTargetLabel}. Add that exact app to Full Disk Access, turn it on, then return here. Access is checked automatically.`
          : "System Settings and the exact app to authorize will open. OpenFolio will never ask for your Apple ID or Messages password."}
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

function ContactsStep({
  busy,
  status,
  sync,
  onSync,
  onContinue,
  onSkip,
}: {
  busy: boolean;
  status: ContactsAccessStatus | null;
  sync: ContactsSyncSummary | null;
  onSync: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const denied = status?.status === "denied";
  const unavailable = status?.status === "restricted" || status?.status === "unsupported";

  return (
    <section className="onboarding-panel">
      <StepMarker current={3} />
      <div className={`onboarding-icon${sync ? " success" : ""}`} aria-hidden="true">
        {sync ? <Check /> : <ContactRound />}
      </div>
      <h1>{sync ? "Names are ready." : "Match phone numbers to names."}</h1>
      <p className="onboarding-lede">
        {sync
          ? "OpenFolio matched your Apple Contacts to the people in your message history."
          : "Optionally sync Apple Contacts before choosing who to make meaning-searchable first."}
      </p>
      <div className="onboarding-assurance">
        <strong>{sync ? `${sync.importedContacts.toLocaleString()} contacts read locally` : "Contacts are optional and stay local"}</strong>
        <p>Matching happens entirely on this Mac. Contact names and details are never uploaded or sent to an API.</p>
        <p>You can skip this now and sync later from Settings. Phone numbers remain available as labels.</p>
      </div>
      {(denied || unavailable) && !sync ? (
        <p className="onboarding-recovery" role="status">
          {unavailable
            ? "Contacts access is unavailable on this Mac. You can continue with phone numbers as labels."
            : "Contacts access is off. OpenFolio can continue without it, or you can enable access in System Settings and try again."}
        </p>
      ) : null}
      <div className="onboarding-actions">
        {sync ? (
          <Button size="lg" onClick={onContinue}>Continue</Button>
        ) : (
          <>
            <Button size="lg" onClick={onSync} disabled={busy || unavailable}>
              {busy ? <RefreshCw className="animate-spin" /> : null}
              {unavailable ? "Contacts unavailable" : denied ? "Open Contacts settings" : "Sync contacts"}
            </Button>
            <Button variant="ghost" onClick={onSkip} disabled={busy}>Skip for now</Button>
          </>
        )}
      </div>
      {!sync && !denied && !unavailable ? <p className="onboarding-help">macOS will ask for Contacts access. OpenFolio only reads it.</p> : null}
    </section>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "Calibrating after the first batch";
  if (seconds < 60) return "Less than a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return `About ${hours} hr${hours === 1 ? "" : "s"}`;
}

function monthLabel(startAt: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(startAt));
}

function MeaningSearchStep({
  plan,
  busy,
  onChange,
  onStart,
}: {
  plan: EmbeddingPlanStats | null;
  busy: boolean;
  onChange: (priority: EmbeddingPriority) => void;
  onStart: () => void;
}) {
  const timeline = plan?.timeline ?? [];
  const latestIndex = Math.max(0, timeline.length - 1);
  const startIndex = plan?.priority.startAt == null
    ? 0
    : Math.max(0, timeline.findIndex((month) => month.startAt >= (plan.priority.startAt ?? 0)));
  const endIndex = plan?.priority.endAt == null
    ? latestIndex
    : Math.max(startIndex, timeline.findIndex((month) => month.startAt >= (plan.priority.endAt ?? 0)) - 1);
  const maxCount = Math.max(1, ...timeline.map((month) => month.count));

  const updateRange = (nextStart: number, nextEnd: number) => {
    if (!plan || timeline.length === 0) return;
    const boundedStart = Math.min(nextStart, nextEnd);
    const boundedEnd = Math.max(nextStart, nextEnd);
    const endMonth = timeline[boundedEnd + 1];
    onChange({
      ...plan.priority,
      startAt: timeline[boundedStart]?.startAt ?? null,
      endAt: endMonth?.startAt ?? null,
    });
  };

  const setRecentMonths = (months: number | null) => {
    if (!plan || timeline.length === 0) return;
    onChange({
      ...plan.priority,
      startAt: months == null ? null : timeline[Math.max(0, timeline.length - months)]?.startAt ?? null,
      endAt: null,
    });
  };

  return (
    <section className="onboarding-panel onboarding-meaning-search">
      <StepMarker current={4} />
      <div className="onboarding-icon success" aria-hidden="true"><Check /></div>
      <h1>Choose what to make meaning-searchable first.</h1>
      <p className="onboarding-lede">
        Exact search is ready for your entire archive. OpenFolio uses this Mac to generate embeddings, so older histories can take a while.
      </p>
      {plan && timeline.length > 0 ? (
        <div className="embedding-plan">
          <div className="embedding-presets" aria-label="Date range presets">
            <button type="button" onClick={() => setRecentMonths(3)}>3 months</button>
            <button type="button" onClick={() => setRecentMonths(6)}>6 months</button>
            <button type="button" onClick={() => setRecentMonths(12)}>1 year</button>
            <button type="button" onClick={() => setRecentMonths(null)}>All history</button>
          </div>
          <div className="embedding-timeline" aria-label="Message history date range">
            <div className="embedding-timeline-bars" aria-hidden="true">
              {timeline.map((month, index) => (
                <span
                  key={month.month}
                  className={index >= startIndex && index <= endIndex ? "selected" : ""}
                  style={{ height: `${Math.max(8, (month.count / maxCount) * 100)}%` }}
                />
              ))}
            </div>
            <input
              aria-label="Start month"
              type="range"
              min={0}
              max={latestIndex}
              value={startIndex}
              onChange={(event) => updateRange(Number(event.target.value), endIndex)}
            />
            <input
              aria-label="End month"
              type="range"
              min={0}
              max={latestIndex}
              value={endIndex}
              onChange={(event) => updateRange(startIndex, Number(event.target.value))}
            />
            <div className="embedding-range-labels">
              <span>{monthLabel(timeline[startIndex]?.startAt ?? Date.now())}</span>
              <span>{monthLabel(timeline[endIndex]?.startAt ?? Date.now())}</span>
            </div>
          </div>
          {plan.people.length > 0 ? (
            <div className="embedding-people">
              <strong>Also prioritize people</strong>
              <div>
                {plan.people.map((person) => {
                  const selected = plan.priority.personIds.includes(person.id);
                  return (
                    <button
                      type="button"
                      key={person.id}
                      className={selected ? "selected" : ""}
                      aria-pressed={selected}
                      onClick={() => onChange({
                        ...plan.priority,
                        personIds: selected
                          ? plan.priority.personIds.filter((id) => id !== person.id)
                          : [...plan.priority.personIds, person.id],
                      })}
                    >
                      {person.displayName}
                      <span>{person.messageCount.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="embedding-plan-summary" aria-live="polite">
            <div><strong>{plan.selectedMessages.toLocaleString()}</strong><span>messages</span></div>
            <div><strong>{plan.selectedConversations.toLocaleString()}</strong><span>conversations</span></div>
            <div><strong>{formatDuration(plan.estimatedSeconds)}</strong><span>{plan.estimateIsCalibrated ? "estimated on this Mac" : "initial estimate"}</span></div>
          </div>
        </div>
      ) : (
        <div className="onboarding-import-status"><RefreshCw className="animate-spin" /><strong>Reading your local timeline…</strong></div>
      )}
      <div className="onboarding-assurance">
        <strong>You can use OpenFolio while this runs</strong>
        <p>Progress is saved document by document. Quit whenever you want; the local worker resumes from the remaining section next time.</p>
      </div>
      <Button size="lg" onClick={onStart} disabled={busy || !plan}>
        {busy ? <RefreshCw className="animate-spin" /> : null}
        Start meaning search
      </Button>
    </section>
  );
}

export function OnboardingView() {
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [embeddingPlan, setEmbeddingPlan] = useState<EmbeddingPlanStats | null>(null);
  const {
    messagesStatus,
    contactsStatus,
    contactsSync,
    importJob,
    threads,
    busy,
    embeddingSync,
    setupDismissed,
    introSeen,
    contactsSetupDone,
    setMessagesStatus,
    setContactsStatus,
    setContactsSync,
    setImportJob,
    setThreads,
    setThreadSummaries,
    setEmbeddingSync,
    setBusy,
    setSetupDismissed,
    setIntroSeen,
    setContactsSetupDone,
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
    if (state.stage !== "ready" || setupDismissed || !contactsSetupDone) return;
    let cancelled = false;
    void window.openfolio.embeddings.getPlan().then(async (nextPlan) => {
      if (cancelled) return;
      if (!nextPlan.priorityConfigured && nextPlan.timeline.length > 0) {
        const recentStart = nextPlan.timeline[Math.max(0, nextPlan.timeline.length - 6)]?.startAt ?? null;
        nextPlan = await window.openfolio.embeddings.setPriority({ startAt: recentStart, endAt: null, personIds: [] });
      }
      if (!cancelled) setEmbeddingPlan(nextPlan);
    }).catch(() => toast.error("OpenFolio could not read embedding coverage."));
    return () => { cancelled = true; };
  }, [state.stage, setupDismissed, contactsSetupDone]);

  async function syncContacts() {
    setBusy(true);
    try {
      let status = contactsStatus;
      if (status?.status !== "granted") {
        status = await window.openfolio.contacts.requestAccess();
        setContactsStatus(status);
      }
      if (status.status !== "granted") return;

      const summary = await window.openfolio.contacts.sync();
      setContactsSync(summary);
    } catch {
      toast.error("Contacts could not be matched. You can skip this and continue.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEmbeddingPriority(priority: EmbeddingPriority) {
    try {
      setEmbeddingPlan(await window.openfolio.embeddings.setPriority(priority));
    } catch {
      toast.error("OpenFolio could not update that range.");
    }
  }

  async function startMeaningSearch() {
    setBusy(true);
    try {
      const semanticStatus = await window.openfolio.embeddings.syncNow();
      setEmbeddingSync(semanticStatus);
      setSetupDismissed(true);
    } catch {
      toast.error("Meaning search could not start. Exact search is still ready.");
    } finally {
      setBusy(false);
    }
  }

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
          accessTargetLabel={messagesStatus?.accessTargetLabel ?? "OpenFolio.app"}
          onBack={() => setIntroSeen(false)}
          onGrant={() => void checkMessagesAccess(true)}
          onCheck={() => void checkMessagesAccess(false)}
        />
      ) : state.stage === "import" ? (
        <ImportStep busy={busy} importJob={importJob} onImport={() => void runImport()} />
      ) : !contactsSetupDone ? (
        <ContactsStep
          busy={busy}
          status={contactsStatus}
          sync={contactsSync}
          onSync={() => void syncContacts()}
          onContinue={() => setContactsSetupDone(true)}
          onSkip={() => setContactsSetupDone(true)}
        />
      ) : (
        <MeaningSearchStep
          plan={embeddingPlan}
          busy={busy}
          onChange={(priority) => void updateEmbeddingPriority(priority)}
          onStart={() => void startMeaningSearch()}
        />
      )}
    </main>
  );
}
