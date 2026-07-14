import type { SearchDocumentRecord } from "@openfolio/shared-types";
import type { LocalEmbeddingEngine } from "./local-embeddings.js";
import { normalizeDocumentForEmbedding } from "./embeddings.js";

/** Local retrieval orchestration. This package intentionally has no remote provider. */
export class AIOrchestrator {
  constructor(private readonly localEmbeddings?: LocalEmbeddingEngine | null) {}

  getEmbeddingMetadata() {
    if (
      this.localEmbeddings
    ) {
      return {
        provider: "local" as const,
        model: "all-MiniLM-L6-v2",
      };
    }
    return {
      provider: null,
      model: null,
    };
  }

  async embed(input: string) {
    return this.localEmbeddings?.embed(input) ?? null;
  }

  async embedDocuments(documents: SearchDocumentRecord[]) {
    if (documents.length === 0) return [];

    if (this.localEmbeddings) {
      const texts = documents.map((doc) => normalizeDocumentForEmbedding(doc));
      return this.localEmbeddings.embedBatch(texts);
    }
    return [];
  }
}
