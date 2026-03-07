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
