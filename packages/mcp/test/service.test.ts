import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineMcpCore } from "../src/mcp-server.js";
import { LocalMcpController } from "../src/service.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("LocalMcpController", () => {
  it("describes stdio setup without pretending a background server is running", async () => {
    const controller = new LocalMcpController();
    const status = await controller.getStatus();

    expect(status.running).toBe(false);
    expect(status.mode).toBe("stdio");
    expect(status.details).toContain("client starts");

    await expect(controller.start()).resolves.toMatchObject({ running: false, mode: "stdio" });
    await expect(controller.stop()).resolves.toMatchObject({ running: false, mode: "stdio" });
  });

  it("constructs the stdio server core offline under a hostile inherited environment", async () => {
    process.env.OPENAI_API_KEY = "hostile-key";
    process.env.CONVEX_URL = "https://example.convex.cloud";
    process.env.HTTPS_PROXY = "http://127.0.0.1:9999";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network access attempted"));
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-mcp-offline-")), "openfolio.sqlite");
    const core = createOfflineMcpCore({ dbPath });

    await expect(core.search("private query")).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    core.db.close();
  });
});
