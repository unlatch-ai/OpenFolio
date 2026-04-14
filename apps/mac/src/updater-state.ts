import type { UpdateState } from "@openfolio/shared-types";

export function createInitialUpdateState(version: string): UpdateState {
  return {
    status: "idle",
    currentVersion: version,
    availableVersion: null,
    downloadedVersion: null,
    progress: null,
    message: null,
    checkedAt: null,
  };
}

export function isAutoUpdateSupported(isPackaged: boolean) {
  return isPackaged;
}

type UpdateErrorLike = {
  code?: string;
  message?: string;
};

export function isMissingPublishedReleaseError(error: unknown) {
  const candidate = (error && typeof error === "object" ? error : null) as UpdateErrorLike | null;
  const code = candidate?.code;
  const message = candidate?.message ?? (typeof error === "string" ? error : "");
  const combined = `${code ?? ""} ${message}`.trim();

  return (
    code === "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" ||
    combined.includes("Unable to find latest version on GitHub") ||
    combined.includes("please ensure a production release exists")
  );
}

export function formatUpdateError(error: unknown) {
  const candidate = (error && typeof error === "object" ? error : null) as UpdateErrorLike | null;
  const message = candidate?.message ?? (typeof error === "string" ? error : "");

  return message || "Failed to check for updates.";
}
