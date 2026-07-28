import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/repo/apps/mac",
  },
}));

import { resolveContactsHelperPaths, validateHelperBundle } from "../src/contacts";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-contacts-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Contacts helper paths", () => {
  it("uses a real resources directory as packaged launch cwd instead of app.asar", () => {
    const paths = resolveContactsHelperPaths({
      isPackaged: true,
      resourcesPath: "/Applications/OpenFolio.app/Contents/Resources",
      appPath: "/Applications/OpenFolio.app/Contents/Resources/app.asar",
    });

    expect(paths.helperAppPath).toBe("/Applications/OpenFolio.app/Contents/Resources/bin/OpenFolio Contacts.app");
    expect(paths.executablePath).toBe("/Applications/OpenFolio.app/Contents/Resources/bin/OpenFolio Contacts.app/Contents/MacOS/OpenFolioContacts");
    expect(paths.launchCwd).toBe("/Applications/OpenFolio.app/Contents/Resources/bin");
  });

  it("uses the development app path for local helper builds", () => {
    const paths = resolveContactsHelperPaths({
      isPackaged: false,
      resourcesPath: "/unused",
      appPath: "/repo/apps/mac",
    });

    expect(paths.helperAppPath).toBe("/repo/apps/mac/bin/OpenFolio Contacts.app");
    expect(paths.launchCwd).toBe("/repo/apps/mac/bin");
  });

  it("validates the helper bundle and executable before launch", () => {
    const root = tempDir();
    const helperAppPath = path.join(root, "bin", "OpenFolio Contacts.app");
    const executablePath = path.join(helperAppPath, "Contents", "MacOS", "OpenFolioContacts");
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, "");

    expect(() => validateHelperBundle({
      helperAppPath,
      executablePath,
      launchCwd: path.join(root, "bin"),
    })).not.toThrow();
  });

  it("exports contact thumbnail keys and avatar data URLs from the native helper", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "native", "contacts-bridge.swift"), "utf8");

    expect(source).toContain("CNContactImageDataAvailableKey");
    expect(source).toContain("CNContactThumbnailImageDataKey");
    expect(source).toContain("avatarDataUrl");
    expect(source).toContain("data:image/jpeg;base64");
  });
});
