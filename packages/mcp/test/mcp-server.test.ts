import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenFolioCore } from "@openfolio/core";
import { getMcpDisabledMessage, isMcpEnabled } from "../src/mcp-server.js";

const tempDirs: string[] = [];

function createCore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-mcp-test-"));
  tempDirs.push(dir);
  return new OpenFolioCore({ dbPath: path.join(dir, "openfolio.sqlite") });
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("MCP access gate", () => {
  it("defaults MCP access off", () => {
    const core = createCore();

    expect(isMcpEnabled(core)).toBe(false);
    expect(getMcpDisabledMessage()).toContain("MCP access is off");
  });

  it("reads MCP access from the local setting", () => {
    const core = createCore();

    core.db.setSetting("mcp.enabled", "1");

    expect(isMcpEnabled(core)).toBe(true);
  });
});
