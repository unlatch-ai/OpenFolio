import crypto from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function contentHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function now() {
  return Date.now();
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function normalizeQueryForFts(query: string) {
  return query
    .split(/\s+/)
    .map((token) => token.trim().replace(/["']/g, ""))
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(" OR ");
}

export function appleTimestampToUnixMs(raw: number | bigint | string | null | undefined) {
  if (raw === null || raw === undefined) return Date.now();
  const numeric = typeof raw === "string" ? Number(raw) : typeof raw === "bigint" ? Number(raw) : raw;
  const appleEpochMs = Date.UTC(2001, 0, 1);

  if (Math.abs(numeric) > 10_000_000_000) {
    return appleEpochMs + Math.floor(numeric / 1_000_000);
  }

  return appleEpochMs + numeric * 1000;
}
