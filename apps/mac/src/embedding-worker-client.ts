import path from "node:path";
import { utilityProcess, type UtilityProcess } from "electron";
import {
  APPROVED_LOCAL_MODEL,
  verifyLocalModelDirectory,
  type EmbeddingEngine,
  type LocalEmbeddingStatus,
} from "@openfolio/core";

type PendingRequest = {
  resolve: (embeddings: Array<number[] | null>) => void;
  reject: (error: Error) => void;
};

type WorkerResponse = {
  requestId: number;
  embeddings?: Array<number[] | null>;
  error?: string;
};

export class EmbeddingWorkerClient implements EmbeddingEngine {
  private child: UtilityProcess | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private lastError: string | null = null;

  constructor(private readonly modelsDir: string, private readonly workerPath: string) {}

  private get modelDirectory() {
    return path.join(
      this.modelsDir,
      ...APPROVED_LOCAL_MODEL.modelId.split("/"),
      APPROVED_LOCAL_MODEL.revision,
    );
  }

  private ensureChild() {
    if (this.child) return this.child;

    const child = utilityProcess.fork(this.workerPath, [], {
      serviceName: "OpenFolio Local Search",
    });
    this.child = child;
    child.postMessage({ type: "configure", modelsDir: this.modelsDir });
    child.on("message", (message: WorkerResponse) => {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      if (message.error) {
        this.lastError = message.error;
        pending.reject(new Error(message.error));
      } else {
        this.lastError = null;
        pending.resolve(message.embeddings ?? []);
      }
    });
    child.on("exit", (code) => {
      const error = new Error(`Local search worker stopped unexpectedly (${code}).`);
      console.error("[openfolio-embeddings]", error.message);
      this.lastError = error.message;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.child = null;
    });
    return child;
  }

  async getStatus(): Promise<LocalEmbeddingStatus> {
    const verification = verifyLocalModelDirectory(this.modelDirectory);
    return {
      ready: this.child !== null && this.lastError === null,
      modelId: APPROVED_LOCAL_MODEL.modelId,
      modelsDir: this.modelsDir,
      modelDownloaded: verification.valid,
      error: this.lastError ?? verification.error,
    };
  }

  async embed(text: string) {
    return (await this.embedBatch([text]))[0] ?? null;
  }

  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (texts.length === 0) return [];
    const verification = verifyLocalModelDirectory(this.modelDirectory);
    if (!verification.valid) {
      this.lastError = verification.error;
      throw new Error(verification.error ?? `Bundled model verification failed at ${this.modelDirectory}.`);
    }

    const requestId = this.nextRequestId++;
    const result = new Promise<Array<number[] | null>>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    this.ensureChild().postMessage({ type: "embed", requestId, texts });
    return result;
  }
}
