import type { UpdateState } from "@openfolio/shared-types";

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
