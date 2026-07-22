import { LocalEmbeddingEngine } from "@openfolio/core";

type EmbeddingWorkerRequest = {
  type: "embed";
  requestId: number;
  texts: string[];
};

type ConfigureWorkerRequest = {
  type: "configure";
  modelsDir: string;
};

let engine: LocalEmbeddingEngine | null = null;
let queue = Promise.resolve();

process.parentPort?.on("message", (event) => {
  const request = event.data as EmbeddingWorkerRequest | ConfigureWorkerRequest;
  if (request.type === "configure") {
    engine = new LocalEmbeddingEngine({ modelsDir: request.modelsDir });
    return;
  }
  queue = queue.then(async () => {
    try {
      if (!engine) throw new Error("Local search worker was not configured.");
      const embeddings = await engine.embedBatch(request.texts);
      if (request.texts.length > 0 && embeddings.every((embedding) => embedding === null)) {
        const status = await engine.getStatus();
        throw new Error(status.error ?? "The local model returned no embeddings.");
      }
      process.parentPort?.postMessage({ requestId: request.requestId, embeddings });
    } catch (error) {
      process.parentPort?.postMessage({
        requestId: request.requestId,
        error: error instanceof Error ? error.message : "Local embedding failed.",
      });
    }
  });
});
