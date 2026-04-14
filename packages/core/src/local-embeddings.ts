import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { LocalEmbeddingConfig } from "./types.js";

const DEFAULT_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_MODELS_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "OpenFolio",
  "models",
);

type Pipeline = (
  texts: string[],
  options?: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

export interface LocalEmbeddingStatus {
  ready: boolean;
  modelId: string;
  modelsDir: string;
  modelDownloaded: boolean;
  error: string | null;
}

/**
 * Local embedding engine using Transformers.js (ONNX Runtime).
 *
 * Runs all-MiniLM-L6-v2 (~23MB) in-process — no external server,
 * no API keys, no network after first model download.
 */
export class LocalEmbeddingEngine {
  private pipeline: Pipeline | null = null;
  private loading: Promise<Pipeline | null> | null = null;
  private initError: string | null = null;

  readonly modelId: string;
  readonly modelsDir: string;

  constructor(config?: Partial<LocalEmbeddingConfig>) {
    this.modelId = config?.modelId ?? DEFAULT_MODEL_ID;
    this.modelsDir = config?.modelsDir ?? DEFAULT_MODELS_DIR;
    fs.mkdirSync(this.modelsDir, { recursive: true });
  }

  /**
   * Lazy-init the pipeline. Downloads the model on first call (~23MB).
   * Subsequent calls reuse the cached pipeline.
   */
  private async ensurePipeline(): Promise<Pipeline | null> {
    if (this.pipeline) return this.pipeline;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        // Dynamic import — Transformers.js is ESM-only
        const { pipeline, env } = await import("@huggingface/transformers");

        // Point model cache to our app-specific directory
        env.cacheDir = this.modelsDir;
        // Disable remote model hub in production if model is already cached
        env.allowRemoteModels = true;

        const pipe = await pipeline("feature-extraction", this.modelId, {
          dtype: "fp32",
          device: "cpu",
        });

        this.pipeline = pipe as unknown as Pipeline;
        this.initError = null;
        return this.pipeline;
      } catch (error) {
        this.initError =
          error instanceof Error ? error.message : "Failed to load embedding model";
        console.error("[openfolio-embeddings] Init failed:", this.initError);
        return null;
      }
    })();

    return this.loading;
  }

  async getStatus(): Promise<LocalEmbeddingStatus> {
    const modelCacheExists = fs.existsSync(
      path.join(this.modelsDir, "models", this.modelId.replace("/", "--")),
    );

    return {
      ready: this.pipeline !== null,
      modelId: this.modelId,
      modelsDir: this.modelsDir,
      modelDownloaded: modelCacheExists,
      error: this.initError,
    };
  }

  /**
   * Embed a single text string. Returns 384-dimensional vector or null on failure.
   */
  async embed(text: string): Promise<number[] | null> {
    const pipe = await this.ensurePipeline();
    if (!pipe) return null;

    try {
      const output = await pipe([text], { pooling: "mean", normalize: true });
      const vectors = output.tolist();
      return vectors[0] ?? null;
    } catch (error) {
      console.error(
        "[openfolio-embeddings] Embed failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Embed multiple texts in a batch. More efficient than calling embed() in a loop.
   * Processes in chunks of 20 to avoid OOM on 8GB M1 machines.
   */
  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (texts.length === 0) return [];

    const pipe = await this.ensurePipeline();
    if (!pipe) return texts.map(() => null);

    const results: Array<number[] | null> = [];
    const chunkSize = 20;

    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      try {
        const output = await pipe(chunk, { pooling: "mean", normalize: true });
        const vectors = output.tolist();
        for (let j = 0; j < chunk.length; j++) {
          results.push(vectors[j] ?? null);
        }
      } catch (error) {
        console.error(
          "[openfolio-embeddings] Batch embed failed for chunk:",
          error instanceof Error ? error.message : error,
        );
        for (let j = 0; j < chunk.length; j++) {
          results.push(null);
        }
      }
    }

    return results;
  }
}
