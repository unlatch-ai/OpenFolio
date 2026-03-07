import { describe, expect, it } from "vitest";
import { createInitialUpdateState, isAutoUpdateSupported } from "../src/updater-state";

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
});
