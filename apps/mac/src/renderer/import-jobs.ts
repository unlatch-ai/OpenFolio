import type { MessagesImportJob } from "@openfolio/shared-types";

export function isImportTerminal(job: MessagesImportJob | null) {
  return Boolean(job && ["completed", "failed", "cancelled"].includes(job.status));
}

export function getImportPrimaryAction(job: MessagesImportJob | null, messagesGranted: boolean) {
  if (!messagesGranted) {
    return { kind: "blocked" as const, label: "Grant access" };
  }

  if (job?.status === "running" || job?.status === "cancelling") {
    return { kind: "cancel" as const, label: job.status === "cancelling" ? "Cancelling..." : "Cancel import" };
  }

  if (job?.status === "failed" || job?.status === "cancelled") {
    return { kind: "retry" as const, label: "Retry import" };
  }

  return { kind: "start" as const, label: job?.status === "completed" ? "Import again" : "Import messages" };
}

export async function waitForImportJob(jobId: string, onUpdate: (job: MessagesImportJob) => void) {
  while (true) {
    const job = await window.openfolio.messages.getImportStatus(jobId);
    if (!job) {
      return null;
    }
    onUpdate(job);
    if (isImportTerminal(job)) {
      return job;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, 600);
    });
  }
}
