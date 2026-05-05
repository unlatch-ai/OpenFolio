import type { UpdateState } from "@openfolio/shared-types";

const RELEASE_BASE_URL = "https://github.com/unlatch-ai/OpenFolio/releases";

export function getUpdateStatusLabel(state: UpdateState | null) {
  switch (state?.status) {
    case "checking":
      return "Checking";
    case "available":
      return "Update available";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Ready to install";
    case "not-available":
      return "Up to date";
    case "error":
      return "Check failed";
    case "unsupported":
      return "Manual updates";
    case "idle":
    default:
      return "Not checked";
  }
}

export function getAppVersionLabel(state: UpdateState | null) {
  return state?.currentVersion ? `OpenFolio ${state.currentVersion}` : "OpenFolio";
}

export function getUpdateVersionLabel(state: UpdateState | null) {
  if (!state) {
    return "Latest version unknown";
  }

  if (state.downloadedVersion) {
    return `Downloaded: ${state.downloadedVersion}`;
  }

  if (state.availableVersion) {
    return `Available: ${state.availableVersion}`;
  }

  return `Installed: ${state.currentVersion}`;
}

export function getLastCheckedLabel(state: UpdateState | null) {
  if (!state?.checkedAt) {
    return "Last checked: never";
  }

  return `Last checked: ${new Date(state.checkedAt).toLocaleString()}`;
}

export function getReleaseNotesUrl(state: UpdateState | null) {
  const version = state?.downloadedVersion || state?.availableVersion || state?.currentVersion;
  return version ? `${RELEASE_BASE_URL}/tag/v${version}` : RELEASE_BASE_URL;
}
