import type {
  ContactsAccessStatus,
  ContactsSyncSummary,
  EmbeddingSyncStatus,
  MessagesAccessStatus,
  MessagesImportJob,
} from "@openfolio/shared-types";

export type OnboardingStepId = "messages" | "import" | "contacts" | "embeddings";
export type OnboardingStepStatus = "complete" | "active" | "blocked" | "waiting" | "running" | "optional";

export interface OnboardingInput {
  messagesStatus: MessagesAccessStatus | null;
  contactsStatus: ContactsAccessStatus | null;
  threadCount: number;
  importJob: MessagesImportJob | null;
  contactsSync: ContactsSyncSummary | null;
  embeddingSync: EmbeddingSyncStatus | null;
  setupDismissed: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  required: boolean;
  actionLabel: string | null;
}

function messagesStep(input: OnboardingInput): OnboardingStep {
  const granted = input.messagesStatus?.status === "granted";
  return {
    id: "messages",
    title: "Allow Messages access",
    description: granted
      ? "OpenFolio can read the local iMessage database."
      : input.messagesStatus?.details || "Grant Full Disk Access so OpenFolio can read local iMessage history.",
    status: granted ? "complete" : "active",
    required: true,
    actionLabel: granted ? "Recheck" : "Grant access",
  };
}

function importStep(input: OnboardingInput, messagesGranted: boolean): OnboardingStep {
  const importCompleted = input.importJob?.status === "completed";
  const imported = input.threadCount > 0 || importCompleted;
  const running = input.importJob?.status === "running";
  const cancelling = input.importJob?.status === "cancelling";
  const failed = input.importJob?.status === "failed";
  const cancelled = input.importJob?.status === "cancelled";
  const importedThreadCount = input.threadCount || input.importJob?.importedThreads || 0;
  return {
    id: "import",
    title: "Import local conversations",
    description: failed
      ? input.importJob?.error || "Import failed. Retry after fixing the issue."
      : cancelled
        ? "Import was cancelled. Retry when you are ready."
        : imported
      ? importedThreadCount > 0
        ? `${importedThreadCount} conversations are ready.`
        : "Import finished. No local conversations were found yet."
      : "Build the local graph from Messages. This reads data locally and does not modify Messages.",
    status: imported ? "complete" : running || cancelling ? "running" : messagesGranted ? "active" : "blocked",
    required: true,
    actionLabel: running ? "Cancel import" : cancelling ? "Cancelling..." : imported ? "Import again" : failed || cancelled ? "Retry import" : "Import messages",
  };
}

function contactsStep(input: OnboardingInput, requiredDone: boolean): OnboardingStep {
  const granted = input.contactsStatus?.status === "granted";
  const synced = Boolean(input.contactsSync && input.contactsSync.importedContacts >= 0);
  const needsSettings = input.contactsStatus?.status === "denied" || input.contactsStatus?.status === "restricted";
  return {
    id: "contacts",
    title: "Sync Apple Contacts",
    description: synced
      ? `${input.contactsSync?.importedContacts ?? 0} contacts synced locally.`
      : needsSettings || input.contactsStatus?.status === "unsupported"
        ? input.contactsStatus?.details ?? "Contacts access is unavailable."
      : "Resolve phone numbers and emails to real names from Apple Contacts.",
    status: synced ? "complete" : granted ? "active" : needsSettings ? "blocked" : requiredDone ? "optional" : "waiting",
    required: false,
    actionLabel: granted ? "Sync contacts" : needsSettings ? "Open Settings" : "Allow and sync",
  };
}

function embeddingsStep(input: OnboardingInput, imported: boolean): OnboardingStep {
  const sync = input.embeddingSync;
  const complete = Boolean(sync && sync.totalDocuments > 0 && sync.dirtyDocuments === 0);
  const progress = sync && sync.totalDocuments > 0
    ? `${sync.embeddedDocuments}/${sync.totalDocuments} documents embedded`
    : "Semantic index will build after import.";

  return {
    id: "embeddings",
    title: "Build semantic index",
    description: complete ? "Semantic search is fully indexed." : progress,
    status: complete ? "complete" : sync?.syncing ? "running" : imported ? "active" : "waiting",
    required: false,
    actionLabel: complete ? "Refresh" : imported ? "Build index" : null,
  };
}

export function getOnboardingState(input: OnboardingInput) {
  const messagesGranted = input.messagesStatus?.status === "granted";
  const imported = input.threadCount > 0 || input.importJob?.status === "completed";
  const requiredDone = messagesGranted && imported;

  const steps = [
    messagesStep(input),
    importStep(input, messagesGranted),
    contactsStep(input, requiredDone),
    embeddingsStep(input, imported),
  ];

  const activeStep = steps.find((step) => step.status === "active")
    ?? steps.find((step) => step.status === "optional")
    ?? steps.find((step) => step.status === "running")
    ?? steps[0];

  const shouldShow = !input.setupDismissed || !requiredDone;

  return {
    shouldShow,
    canEnterApp: requiredDone,
    activeStepId: activeStep.id,
    steps,
    progress: {
      completedRequired: steps.filter((step) => step.required && step.status === "complete").length,
      totalRequired: steps.filter((step) => step.required).length,
    },
  };
}
