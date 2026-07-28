import crypto from "node:crypto";

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

function getDefaultPhoneRegion(): CountryCode {
  const configured = process.env.OPENFOLIO_PHONE_REGION?.trim().toUpperCase();
  if (configured && /^[A-Z]{2}$/.test(configured)) {
    return configured as CountryCode;
  }

  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale.match(/[-_]([A-Z]{2})\b/i)?.[1]?.toUpperCase();
  return (region || "US") as CountryCode;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return values.filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

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
  if (raw === null || raw === undefined) return 0;
  const numeric = typeof raw === "string" ? Number(raw) : typeof raw === "bigint" ? Number(raw) : raw;
  const appleEpochMs = Date.UTC(2001, 0, 1);

  if (Math.abs(numeric) > 10_000_000_000) {
    return appleEpochMs + Math.floor(numeric / 1_000_000);
  }

  return appleEpochMs + numeric * 1000;
}

export function normalizeHandle(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    return lower;
  }

  const parsed = parsePhoneNumberFromString(trimmed, getDefaultPhoneRegion());
  if (parsed?.isPossible()) {
    return parsed.number;
  }

  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits) {
    return trimmed;
  }

  if (digits.startsWith("+")) {
    return `+${digits.slice(1).replace(/\D/g, "")}`;
  }

  return digits.replace(/\D/g, "");
}

export function getHandleCandidates(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = normalizeHandle(trimmed);
  if (normalized?.includes("@")) {
    return [normalized];
  }

  const parsed = parsePhoneNumberFromString(trimmed, getDefaultPhoneRegion());
  const digits = trimmed.replace(/\D/g, "");
  const digitOnly = digits.startsWith("+") ? digits.slice(1) : digits;

  return uniqueValues([
    normalized,
    parsed?.number,
    parsed?.nationalNumber,
    digitOnly || null,
  ]);
}
