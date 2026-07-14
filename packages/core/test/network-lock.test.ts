import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenFolioCore } from "../src/app.js";
import { LocalEmbeddingEngine } from "../src/local-embeddings.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function tempPath(name: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-network-lock-")), name);
}

describe("core Network Lock", () => {
  it("ignores inherited provider, hosted, model-hub, and proxy configuration", async () => {
    process.env.OPENAI_API_KEY = "hostile-key";
    process.env.OPENAI_MODEL = "remote-model";
    process.env.CONVEX_URL = "https://example.convex.cloud";
    process.env.HF_ENDPOINT = "https://example.invalid";
    process.env.HTTPS_PROXY = "http://127.0.0.1:9999";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network access attempted"));
    const core = new OpenFolioCore({ dbPath: tempPath("openfolio.sqlite"), networkPolicy: "offline" });

    const search = await core.search("nothing remote");
    const answer = await core.ask("nothing remote");

    expect(search).toEqual([]);
    expect(answer.provider).toBe("local");
    expect(fetchSpy).not.toHaveBeenCalled();
    core.db.close();
  });

  it("fails closed without a local model and never attempts fetch", async () => {
    const modelsDir = tempPath("models");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network access attempted"));
    const engine = new LocalEmbeddingEngine({ modelsDir, modelId: "Xenova/all-MiniLM-L6-v2" });

    await expect(engine.embed("private text")).resolves.toBeNull();
    await expect(engine.embedBatch(["one", "two"])).resolves.toEqual([null, null]);
    await expect(engine.getStatus()).resolves.toMatchObject({
      ready: false,
      modelDownloaded: false,
      error: expect.stringMatching(/unavailable/i),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
