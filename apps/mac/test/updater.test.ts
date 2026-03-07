import { describe, expect, it } from "vitest";
import { createInitialUpdateState, formatUpdateError, isAutoUpdateSupported, isMissingPublishedReleaseError } from "../src/updater-state";

describe("updater helpers", () => {
  it("creates an idle initial update state", () => {
    expect(createInitialUpdateState("1.2.3")).toEqual({
      status: "idle",
      currentVersion: "1.2.3",
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      message: null,
      checkedAt: null,
    });
  });

  it("treats unpackaged builds as unsupported for auto updates", () => {
    expect(isAutoUpdateSupported(false)).toBe(false);
    expect(isAutoUpdateSupported(true)).toBe(true);
  });

  it("detects the no published release updater case", () => {
    expect(isMissingPublishedReleaseError({
      code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
      message:
        "Unable to find latest version on GitHub (https://github.com/unlatch-ai/OpenFolio/releases/latest), please ensure a production release exists: HttpError: 406",
    })).toBe(true);
  });

  it("falls back to the original error message for unrelated updater failures", () => {
    expect(isMissingPublishedReleaseError(new Error("Network timeout"))).toBe(false);
    expect(formatUpdateError(new Error("Network timeout"))).toBe("Network timeout");
  });
});
