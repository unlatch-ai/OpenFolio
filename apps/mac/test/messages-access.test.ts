import { describe, expect, it } from "vitest";
import { getMessagesAccessTarget, withMessagesAccessGuidance } from "../src/messages-access";

describe("messages access guidance", () => {
  it("prefers the packaged app bundle as the Full Disk Access target", () => {
    const target = getMessagesAccessTarget({
      appExecutablePath: "/Applications/OpenFolio.app/Contents/MacOS/OpenFolio",
      processExecPath: "/Applications/OpenFolio.app/Contents/MacOS/OpenFolio",
      pathExists: (targetPath) => targetPath === "/Applications/OpenFolio.app",
    });

    expect(target).toEqual({
      label: "OpenFolio.app",
      revealPath: "/Applications/OpenFolio.app",
    });
  });

  it("adds Full Disk Access guidance when Messages access is denied", () => {
    const status = withMessagesAccessGuidance(
      {
        status: "denied",
        chatDbPath: "/Users/test/Library/Messages/chat.db",
        details: "OpenFolio cannot read Messages yet.",
      },
      {
        target: {
          label: "OpenFolio.app",
          revealPath: "/Applications/OpenFolio.app",
        },
        appIsPackaged: true,
        processExecPath: "/Applications/OpenFolio.app/Contents/MacOS/OpenFolio",
        openedSettings: true,
        revealedInFinder: true,
      },
    );

    expect(status.requiresFullDiskAccess).toBe(true);
    expect(status.openedFullDiskAccessSettings).toBe(true);
    expect(status.revealedInFinder).toBe(true);
    expect(status.accessTargetLabel).toBe("OpenFolio.app");
    expect(status.details).toContain("Full Disk Access");
    expect(status.details).toContain("relaunch OpenFolio");
  });
});
