import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { LocalEmbeddingConfig } from "./types.js";

const DEFAULT_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const APPROVED_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

interface ApprovedModelFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ApprovedLocalModel {
  modelId: string;
  revision: string;
  dtype: "q8";
  embeddingDimension: number;
  files: readonly ApprovedModelFile[];
}

export const APPROVED_LOCAL_MODEL: ApprovedLocalModel = Object.freeze({
  modelId: DEFAULT_MODEL_ID,
  revision: APPROVED_REVISION,
  dtype: "q8",
  embeddingDimension: 384,
  files: Object.freeze([
    { path: "config.json", size: 650, sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7" },
    { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
    { path: "tokenizer.json", size: 711661, sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0" },
    { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
    { path: "vocab.txt", size: 231508, sha256: "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3" },
    { path: "onnx/model_quantized.onnx", size: 22972370, sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1" },
    { path: "MODEL_CARD.md", size: 1767, sha256: "63ea99bf681a2e9eda4f6a537d5ed8fda95d1677111656da37e9cfd080c3af02" },
    { path: "LICENSE.txt", size: 10318, sha256: "1e66d43b04a3f2428303ad3316d1fbb996991541192892b22d21f0065a093b2b" },
  ]),
});

type ElectronProcess = NodeJS.Process & {
  defaultApp?: boolean;
  resourcesPath?: string;
};

function defaultModelsRoot() {
  const electronProcess = process as ElectronProcess;
  if (electronProcess.resourcesPath && !electronProcess.defaultApp) {
    return path.join(electronProcess.resourcesPath, "models");
  }
  return path.join(process.cwd(), ".model-cache", "models");
}

function sha256(filePath: string) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export interface LocalModelVerification {
  valid: boolean;
  error: string | null;
}

export function verifyLocalModelDirectory(
  modelDirectory: string,
  model: ApprovedLocalModel = APPROVED_LOCAL_MODEL,
): LocalModelVerification {
  for (const file of model.files) {
    const filePath = path.join(modelDirectory, file.path);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return { valid: false, error: `Bundled model file is missing: ${file.path}` };
    }
    if (!stat.isFile() || stat.size !== file.size) {
      return {
        valid: false,
        error: `Bundled model file has an invalid size: ${file.path}`,
      };
    }
    if (sha256(filePath) !== file.sha256) {
      return {
        valid: false,
        error: `Bundled model file failed integrity verification: ${file.path}`,
      };
    }
  }
  return { valid: true, error: null };
}

type Pipeline = (
  texts: string[],
  options?: {
    pooling: string;
    normalize: boolean;
    truncation: boolean;
    max_length: number;
  },
) => Promise<{ tolist: () => number[][] }>;

const EMBEDDING_MAX_TOKENS = 256;
const EMBEDDING_CHUNK_SIZE = 1;

function embeddingOptions() {
  return {
    pooling: "mean",
    normalize: true,
    truncation: true,
    max_length: EMBEDDING_MAX_TOKENS,
  };
}

async function yieldToEventLoop() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export interface LocalEmbeddingStatus {
  ready: boolean;
  modelId: string;
  modelsDir: string;
  modelDownloaded: boolean;
  error: string | null;
}

export interface EmbeddingEngine {
  getStatus(): Promise<LocalEmbeddingStatus>;
  embed(text: string): Promise<number[] | null>;
  embedBatch(texts: string[]): Promise<Array<number[] | null>>;
}

/** Local q8 embedding engine. Assets are accepted only by approved hash. */
export class LocalEmbeddingEngine {
  private pipeline: Pipeline | null = null;
  private loading: Promise<Pipeline | null> | null = null;
  private initError: string | null = null;

  readonly modelId: string;
  readonly modelsDir: string;

  constructor(config?: Partial<LocalEmbeddingConfig>) {
    this.modelId = config?.modelId ?? DEFAULT_MODEL_ID;
    this.modelsDir = config?.modelsDir ?? defaultModelsRoot();
  }

  private getModelDirectory() {
    return path.join(this.modelsDir, ...this.modelId.split("/"), APPROVED_REVISION);
  }

  private verifyModel() {
    if (this.modelId !== APPROVED_LOCAL_MODEL.modelId) {
      return { valid: false, error: "The configured local embedding model is not approved." };
    }
    return verifyLocalModelDirectory(this.getModelDirectory());
  }

  /** Missing or corrupt assets fail closed and leave full-text search available. */
  private async ensurePipeline(): Promise<Pipeline | null> {
    if (this.pipeline) return this.pipeline;
    if (this.loading) return this.loading;

    const verification = this.verifyModel();
    if (!verification.valid) {
      this.initError = `${verification.error} Semantic search is disabled; full-text search remains available.`;
      return null;
    }

    this.loading = (async () => {
      try {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        env.useFSCache = false;
        env.useBrowserCache = false;
        env.localModelPath = this.modelsDir;

        const pipe = await pipeline("feature-extraction", this.getModelDirectory(), {
          dtype: APPROVED_LOCAL_MODEL.dtype,
          device: "cpu",
          revision: APPROVED_LOCAL_MODEL.revision,
          local_files_only: true,
        });

        this.pipeline = pipe as unknown as Pipeline;
        this.initError = null;
        return this.pipeline;
      } catch (error) {
        this.initError = error instanceof Error ? error.message : "Failed to load embedding model";
        console.error("[openfolio-embeddings] Init failed:", this.initError);
        return null;
      }
    })();

    return this.loading;
  }

  async getStatus(): Promise<LocalEmbeddingStatus> {
    const verification = this.verifyModel();
    return {
      ready: this.pipeline !== null,
      modelId: this.modelId,
      modelsDir: this.modelsDir,
      modelDownloaded: verification.valid,
      error: this.initError ?? verification.error,
    };
  }

  async embed(text: string): Promise<number[] | null> {
    const pipe = await this.ensurePipeline();
    if (!pipe) return null;
    try {
      const output = await pipe([text], embeddingOptions());
      const vector = output.tolist()[0] ?? null;
      return vector?.length === APPROVED_LOCAL_MODEL.embeddingDimension ? vector : null;
    } catch (error) {
      console.error("[openfolio-embeddings] Embed failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (texts.length === 0) return [];
    const pipe = await this.ensurePipeline();
    if (!pipe) return texts.map(() => null);

    const results: Array<number[] | null> = [];
    for (let i = 0; i < texts.length; i += EMBEDDING_CHUNK_SIZE) {
      const chunk = texts.slice(i, i + EMBEDDING_CHUNK_SIZE);
      try {
        const vectors = (await pipe(chunk, embeddingOptions())).tolist();
        for (let j = 0; j < chunk.length; j++) {
          const vector = vectors[j] ?? null;
          results.push(vector?.length === APPROVED_LOCAL_MODEL.embeddingDimension ? vector : null);
        }
      } catch (error) {
        console.error("[openfolio-embeddings] Batch embed failed for chunk:", error instanceof Error ? error.message : error);
        results.push(...chunk.map(() => null));
      }
      await yieldToEventLoop();
    }
    return results;
  }
}
