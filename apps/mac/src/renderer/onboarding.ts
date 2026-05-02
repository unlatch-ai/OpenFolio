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
  const imported = input.threadCount > 0 || (input.importJob?.status === "completed" && input.importJob.importedMessages > 0);
  const running = input.importJob?.status === "running";
  return {
    id: "import",
    title: "Import local conversations",
    description: imported
      ? `${input.threadCount || input.importJob?.importedThreads || 0} conversations are ready.`
      : "Build the local graph from Messages. This reads data locally and does not modify Messages.",
    status: imported ? "complete" : running ? "running" : messagesGranted ? "active" : "blocked",
    required: true,
    actionLabel: imported ? "Import again" : running ? null : "Import messages",
  };
}

function contactsStep(input: OnboardingInput, requiredDone: boolean): OnboardingStep {
  const granted = input.contactsStatus?.status === "granted";
  const synced = Boolean(input.contactsSync && input.contactsSync.importedContacts >= 0);
  return {
    id: "contacts",
    title: "Sync Apple Contacts",
    description: synced
      ? `${input.contactsSync?.importedContacts ?? 0} contacts synced locally.`
      : "Resolve phone numbers and emails to real names from Apple Contacts.",
    status: synced ? "complete" : granted ? "active" : requiredDone ? "optional" : "waiting",
    required: false,
    actionLabel: granted ? "Sync contacts" : "Allow and sync",
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
  const imported = input.threadCount > 0 || (input.importJob?.status === "completed" && input.importJob.importedMessages > 0);
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
