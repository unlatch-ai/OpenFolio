import type {
  MessagesAccessStatus,
  MessagesImportJob,
} from "@openfolio/shared-types";

export type OnboardingStage = "messages" | "import" | "ready";

export interface OnboardingInput {
  messagesStatus: MessagesAccessStatus | null;
  threadCount: number;
  importJob: MessagesImportJob | null;
  setupDismissed: boolean;
}

export function getOnboardingState(input: OnboardingInput) {
  const messagesGranted = input.messagesStatus?.status === "granted";
  const imported = input.threadCount > 0 || input.importJob?.status === "completed";
  const requiredDone = messagesGranted && imported;
  const stage: OnboardingStage = !messagesGranted
    ? "messages"
    : !imported
      ? "import"
      : "ready";

  const shouldShow = !input.setupDismissed || !requiredDone;

  return {
    shouldShow,
    canEnterApp: requiredDone,
    stage,
    messagesGranted,
    imported,
  };
}
