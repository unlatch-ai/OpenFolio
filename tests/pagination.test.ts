import { describe, it, expect } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/pagination";

describe("pagination cursor", () => {
  it("round-trips a cursor payload", () => {
    const payload = {
      sort: "created_at",
      dir: "desc" as const,
      value: "2024-01-01T00:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    };
    const cursor = encodeCursor(payload);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual(payload);
  });

  it("round-trips a null value cursor payload", () => {
    const payload = {
      sort: "venue_name",
      dir: "asc" as const,
      value: null,
      id: "00000000-0000-0000-0000-000000000002",
    };
    const cursor = encodeCursor(payload);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual(payload);
  });

  it("returns null for invalid cursor payloads", () => {
    expect(decodeCursor("not-a-valid-base64")).toBeNull();
    expect(decodeCursor(encodeCursor({
      sort: "created_at",
      dir: "up" as "asc",
      value: "bad",
      id: "00000000-0000-0000-0000-000000000003",
    }))).toBeNull();
  });
});
