type CursorPayload = {
  sort: string;
  dir: "asc" | "desc";
  value: unknown;
  id: string;
};

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.sort || !parsed.dir || !parsed.id) return null;
    if (parsed.dir !== "asc" && parsed.dir !== "desc") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatFilterValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const str = String(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
  return `"${str}"`;
}
