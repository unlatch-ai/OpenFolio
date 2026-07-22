import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_LOCAL_MODEL,
  LocalEmbeddingEngine,
  verifyLocalModelDirectory,
  type ApprovedLocalModel,
} from "../src/local-embeddings.js";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-model-verify-"));
}

describe("bundled local model verification", () => {
  it("keeps the runtime allowlist synchronized with the packaging manifest", () => {
    const manifestPath = fileURLToPath(
      new URL("../../../apps/mac/model/all-MiniLM-L6-v2.manifest.json", import.meta.url),
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect({
      modelId: manifest.modelId,
      revision: manifest.revision,
      dtype: manifest.dtype,
      embeddingDimension: manifest.embeddingDimension,
      files: manifest.files.map(({ path: filePath, size, sha256: digest }: ApprovedLocalModel["files"][number]) => ({
        path: filePath,
        size,
        sha256: digest,
      })),
    }).toEqual(APPROVED_LOCAL_MODEL);
  });

  it("accepts only files with the approved size and hash", () => {
    const directory = tempDirectory();
    const content = "approved local bytes";
    const manifest: ApprovedLocalModel = {
      modelId: "test/model",
      revision: "immutable",
      dtype: "q8",
      embeddingDimension: 384,
      files: [{ path: "onnx/model_quantized.onnx", size: Buffer.byteLength(content), sha256: sha256(content) }],
    };

    expect(verifyLocalModelDirectory(directory, manifest)).toMatchObject({ valid: false, error: expect.stringMatching(/missing/i) });

    fs.mkdirSync(path.join(directory, "onnx"));
    fs.writeFileSync(path.join(directory, "onnx/model_quantized.onnx"), "corrupt");
    expect(verifyLocalModelDirectory(directory, manifest)).toMatchObject({ valid: false, error: expect.stringMatching(/size/i) });

    fs.writeFileSync(path.join(directory, "onnx/model_quantized.onnx"), content);
    expect(verifyLocalModelDirectory(directory, manifest)).toEqual({ valid: true, error: null });

    fs.writeFileSync(path.join(directory, "onnx/model_quantized.onnx"), `X${content.slice(1)}`);
    expect(verifyLocalModelDirectory(directory, manifest)).toMatchObject({ valid: false, error: expect.stringMatching(/integrity/i) });
  });

  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const cacheRoot = path.join(repositoryRoot, "apps/mac/.model-cache/models");
  const modelDirectory = path.join(cacheRoot, ...APPROVED_LOCAL_MODEL.modelId.split("/"), APPROVED_LOCAL_MODEL.revision);

  it.skipIf(!fs.existsSync(modelDirectory))(
    "loads the vendored q8 model without fetch and returns 384 dimensions",
    async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network attempted"));
      const engine = new LocalEmbeddingEngine({ modelsDir: cacheRoot });
      const vector = await engine.embed("A local semantic-search verification sentence.");
      expect(vector).toHaveLength(APPROVED_LOCAL_MODEL.embeddingDimension);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    30_000,
  );

  it.skipIf(!fs.existsSync(modelDirectory))(
    "truncates unusually long local text before ONNX inference",
    async () => {
      const engine = new LocalEmbeddingEngine({ modelsDir: cacheRoot });
      const vectors = await engine.embedBatch(
        Array.from({ length: 8 }, (_, index) => `long local message ${index} `.repeat(20_000)),
      );
      expect(vectors).toHaveLength(8);
      expect(vectors.every((vector) => vector?.length === APPROVED_LOCAL_MODEL.embeddingDimension)).toBe(true);
    },
    30_000,
  );
});
