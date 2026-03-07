import OpenAI from "openai";
import type { AskResponse, EmbeddingProvider, SearchDocumentRecord, SearchResult } from "@openfolio/shared-types";
import type { StoredProviderConfig } from "./types.js";
import { normalizeDocumentForEmbedding } from "./embeddings.js";

function formatContext(results: SearchResult[]) {
  return results
    .map((result, index) => `${index + 1}. [${result.kind}] ${result.title}\n${result.snippet}`)
    .join("\n\n");
}

export class AIOrchestrator {
  constructor(private readonly config: StoredProviderConfig | null) {}

  getEmbeddingMetadata() {
    return {
      provider: (this.config?.provider ?? null) as EmbeddingProvider | null,
      model: this.config?.embeddingModel || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    };
  }

  async embed(input: string) {
    if (!this.config || this.config.provider !== "openai" || !this.config.apiKey) {
      return null;
    }

    const client = new OpenAI({ apiKey: this.config.apiKey });
    const response = await client.embeddings.create({
      model: this.config.embeddingModel || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input
    });

    return response.data[0]?.embedding ?? null;
  }

  async embedDocuments(documents: SearchDocumentRecord[]) {
    if (!this.config || this.config.provider !== "openai" || !this.config.apiKey || documents.length === 0) {
      return [];
    }

    const client = new OpenAI({ apiKey: this.config.apiKey });
    const model = this.getEmbeddingMetadata().model;
    const response = await client.embeddings.create({
      model,
      input: documents.map((document) => normalizeDocumentForEmbedding(document)),
    });

    return response.data.map((entry) => entry.embedding);
  }

  async answer(question: string, results: SearchResult[]): Promise<AskResponse> {
    if (!this.config || !this.config.apiKey || this.config.provider !== "openai") {
      return {
        answer: results.length > 0
          ? `Local-only mode: found ${results.length} relevant result(s).\n\n${results
              .slice(0, 3)
              .map((result) => `- ${result.title}: ${result.snippet}`)
              .join("\n")}`
          : "Local-only mode: no matching context found yet.",
        citations: results.slice(0, 5),
        provider: "local"
      };
    }

    const client = new OpenAI({ apiKey: this.config.apiKey });
    const prompt = [
      "You are OpenFolio AI, a local-first relationship assistant.",
      "Answer the question using only the provided context.",
      "If the answer is uncertain, say so clearly.",
      "",
      `Question: ${question}`,
      "",
      "Context:",
      formatContext(results),
    ].join("\n");

    const response = await client.responses.create({
      model: this.config.model || process.env.OPENAI_MODEL || "gpt-5-mini",
      input: prompt
    });

    return {
      answer: response.output_text || "No answer returned.",
      citations: results.slice(0, 5),
      provider: "openai"
    };
  }
}
