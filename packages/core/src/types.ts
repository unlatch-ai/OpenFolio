export type QueryRow = Record<string, unknown>;

export interface StoredProviderConfig {
  provider: "openai" | "hosted" | "local";
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
}

export interface LocalEmbeddingConfig {
  modelId: string;
  modelsDir: string;
}
