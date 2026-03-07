export type QueryRow = Record<string, unknown>;

export interface StoredProviderConfig {
  provider: "openai" | "hosted";
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
}
